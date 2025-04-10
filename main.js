const { PDFDocument, rgb, StandardFonts } = PDFLib;

document.addEventListener('DOMContentLoaded', () => {
    const pdfUpload = document.getElementById('pdf-upload');
    const editorSection = document.getElementById('editor-section');
    const pdfContainer = document.getElementById('pdf-container');
    const addTextButton = document.getElementById('add-text');
    const savePdfButton = document.getElementById('save-pdf');

    let originalArrayBuffer = null; // Stores the raw ArrayBuffer from the file
    let originalPdfBytes = null;    // Uint8Array for rendering/editing
    let pdfDoc = null;              // PDFLib document for editing
    const scale = 1.5;              // Scale for rendering PDF pages

    // Loading indicator functions
    function showLoading(show) {
        const loadingEl = document.getElementById('loading-indicator') || createLoadingIndicator();
        loadingEl.style.display = show ? 'flex' : 'none';
    }

    function createLoadingIndicator() {
        const loadingEl = document.createElement('div');
        loadingEl.id = 'loading-indicator';
        loadingEl.innerHTML = 'Processing PDF...';
        Object.assign(loadingEl.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            color: 'white',
            display: 'none',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '9999'
        });
        document.body.appendChild(loadingEl);
        return loadingEl;
    }

    // Validate that the file is a PDF
    function validatePdf(file) {
        if (!file) return false;
        if (file.type !== 'application/pdf') {
            alert('Please upload a valid PDF file.');
            return false;
        }
        return true;
    }

    pdfUpload.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!validatePdf(file)) return;

        showLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            // Save the original ArrayBuffer (do not modify it)
            originalArrayBuffer = arrayBuffer;
            // Create a Uint8Array copy for pdf.js and PDFLib
            originalPdfBytes = new Uint8Array(arrayBuffer);

            // Load PDFLib document for later editing
            pdfDoc = await PDFDocument.load(originalPdfBytes);

            // Render using pdf.js
            await renderPdf();
            editorSection.style.display = 'block';
        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Failed to load PDF. Please try again.');
        } finally {
            showLoading(false);
        }
    });

    // Use pdf.js for rendering so that getViewport is valid
    async function renderPdf() {
        pdfContainer.innerHTML = '';
        // Load the PDF using pdf.js from originalPdfBytes
        const loadingTask = pdfjsLib.getDocument({ data: originalPdfBytes });
        const pdfJsDoc = await loadingTask.promise;

        for (let pageNum = 1; pageNum <= pdfJsDoc.numPages; pageNum++) {
            const page = await pdfJsDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const pageDiv = document.createElement('div');
            pageDiv.className = 'pdf-page';
            pageDiv.dataset.pageIndex = pageNum - 1;
            Object.assign(pageDiv.style, {
                position: 'relative',
                marginBottom: '20px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                width: `${viewport.width}px`,
                height: `${viewport.height}px`
            });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            pageDiv.appendChild(canvas);
            pdfContainer.appendChild(pageDiv);
            const context = canvas.getContext('2d');
            const renderContext = { canvasContext: context, viewport: viewport };
            await page.render(renderContext).promise;
        }
    }

    addTextButton.addEventListener('click', () => {
        // Use the first PDF page for adding text field
        const pageDiv = pdfContainer.querySelector('.pdf-page');
        if (pageDiv) {
            createTextField(100, 100, 'Click to edit text', pageDiv);
        } else {
            alert('Please load a PDF first');
        }
    });

    function createTextField(x, y, text, pageDiv) {
        const textField = document.createElement('div');
        textField.contentEditable = true;
        textField.className = 'draggable';
        textField.textContent = text;
        Object.assign(textField.style, {
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            minWidth: '100px',
            minHeight: '20px',
            padding: '4px',
            border: '1px dashed #007bff',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            zIndex: '1000'
        });
        textField.dataset.pageIndex = pageDiv.dataset.pageIndex;
        pageDiv.appendChild(textField);
        makeElementDraggableAndResizable(textField);
        textField.focus();
        return textField;
    }

    function makeElementDraggableAndResizable(element) {
        // Ensure Interact.js is loaded via a script tag in index.html
        window.interact(element)
            .draggable({
                inertia: false,
                modifiers: [
                    window.interact.modifiers.restrictRect({
                        restriction: 'parent',
                        endOnly: true
                    })
                ],
                autoScroll: true,
                listeners: { move: dragMoveListener }
            })
            .resizable({
                edges: { left: true, right: true, bottom: true, top: true },
                restrictEdges: { outer: 'parent', endOnly: true },
                inertia: false,
                listeners: { move: resizeMoveListener }
            });
    }

    function dragMoveListener(event) {
        const target = event.target;
        const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
        const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
        target.style.transform = `translate(${x}px, ${y}px)`;
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    }

    function resizeMoveListener(event) {
        const target = event.target;
        const x = (parseFloat(target.getAttribute('data-x')) || 0);
        const y = (parseFloat(target.getAttribute('data-y')) || 0);
        Object.assign(target.style, {
            width: `${event.rect.width}px`,
            height: `${event.rect.height}px`,
            transform: `translate(${x + event.deltaRect.left}px, ${y + event.deltaRect.top}px)`
        });
        target.setAttribute('data-x', x + event.deltaRect.left);
        target.setAttribute('data-y', y + event.deltaRect.top);
    }

    /**
 * Creates a deep copy of an ArrayBuffer.
 */
    function copyArrayBuffer(buffer) {
        const copy = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(copy).set(new Uint8Array(buffer));
        return copy;
    }

    savePdfButton.addEventListener('click', async () => {
        try {
            if (!pdfDoc || !originalArrayBuffer) {
                throw new Error('No valid PDF document is loaded');
            }
            showLoading(true);

            // Create a fresh copy of the original ArrayBuffer and then a Uint8Array from it.
            const freshBuffer = copyArrayBuffer(originalArrayBuffer);
            const pdfBytesCopy = new Uint8Array(freshBuffer);
            console.log('PDF header:', new TextDecoder().decode(pdfBytesCopy.subarray(0, 4))); // should print "%PDF"

            // Load a fresh PDFLib document
            const editedPdfDoc = await PDFDocument.load(pdfBytesCopy);

            // Get text fields and calculate positions
            const textFields = document.querySelectorAll('.draggable');
            if (textFields.length === 0) {
                alert('No text has been added to the document.');
                showLoading(false);
                return;
            }
            const helveticaFont = await editedPdfDoc.embedFont(StandardFonts.Helvetica);

            const textData = Array.from(textFields).map(field => {
                const rect = field.getBoundingClientRect();
                const pageDiv = field.closest('.pdf-page');
                const pageRect = pageDiv.getBoundingClientRect();
                let x = rect.left - pageRect.left;
                let y = rect.top - pageRect.top;
                const dataX = parseFloat(field.getAttribute('data-x')) || 0;
                const dataY = parseFloat(field.getAttribute('data-y')) || 0;
                x += dataX;
                y += dataY;
                return {
                    text: field.textContent,
                    x: x / scale,
                    y: y / scale,
                    width: rect.width / scale,
                    height: rect.height / scale,
                    pageIndex: parseInt(pageDiv.dataset.pageIndex, 10)
                };
            });

            for (const field of textData) {
                try {
                    const page = editedPdfDoc.getPages()[field.pageIndex];
                    if (page) {
                        const { height } = page.getSize();
                        // Adjust y-coordinate (PDF coordinate origin is bottom-left)
                        const pdfY = height - field.y - (field.height / 2);
                        page.drawText(field.text, {
                            x: field.x,
                            y: pdfY,
                            size: 12,
                            font: helveticaFont,
                            color: rgb(0, 0, 0)
                        });
                    }
                } catch (pageError) {
                    console.error(`Error adding text to page ${field.pageIndex}:`, pageError);
                }
            }

            const modifiedPdfBytes = await editedPdfDoc.save();
            const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = 'edited-document.pdf';
            downloadLink.style.display = 'none';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);
            alert('PDF saved successfully!');
        } catch (error) {
            console.error('Error saving PDF:', error);
            alert('Failed to save PDF: ' + error.message);
        } finally {
            showLoading(false);
        }
    });


});