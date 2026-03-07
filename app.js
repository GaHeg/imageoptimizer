// State management
const state = {
    sourceImage: null,
    sourceImageBitmap: null,
    previewCanvas: null,
    previewCtx: null,
    aspectRatio: { width: 16, height: 9 },
    outputWidth: 1920,
    focalPoint: null,
    scaleFactor: 1,
    isCustomRatio: false,
    customRatioStart: null,
    isDraggingFocal: false,
    isDraggingCorner: false,
    dragOffset: { x: 0, y: 0 }
};

// DOM elements
const elements = {
    imageInput: document.getElementById('imageInput'),
    heicWarning: document.getElementById('heicWarning'),
    controlsSection: document.getElementById('controlsSection'),
    previewSection: document.getElementById('previewSection'),
    outputSection: document.getElementById('outputSection'),
    exportSection: document.getElementById('exportSection'),
    previewCanvas: document.getElementById('previewCanvas'),
    focalPointMarker: document.getElementById('focalPointMarker'),
    cropOverlay: document.getElementById('cropOverlay'),
    resizeHandle: document.getElementById('resizeHandle'),
    presetButtons: document.querySelectorAll('.preset-btn'),
    widthSelect: document.getElementById('widthSelect'),
    dimensionInfo: document.getElementById('dimensionInfo'),
    formatSelect: document.getElementById('formatSelect'),
    qualityGroup: document.getElementById('qualityGroup'),
    qualitySlider: document.getElementById('qualitySlider'),
    qualityValue: document.getElementById('qualityValue'),
    cssOutput: document.getElementById('cssOutput'),
    copyCssBtn: document.getElementById('copyCssBtn'),
    exportBtn: document.getElementById('exportBtn'),
    previewInfo: document.getElementById('previewInfo')
};

// Initialize
function init() {
    // Check WebP support
    const webpSupported = checkWebPSupport();
    if (!webpSupported) {
        const webpOption = document.getElementById('webpOption');
        if (webpOption) webpOption.style.display = 'none';
    }

    // Event listeners
    elements.imageInput.addEventListener('change', handleImageUpload);
    elements.presetButtons.forEach(btn => {
        btn.addEventListener('click', () => handleAspectRatioPreset(btn.dataset.ratio));
    });
    elements.widthSelect.addEventListener('change', handleWidthChange);
    elements.formatSelect.addEventListener('change', handleFormatChange);
    elements.qualitySlider.addEventListener('input', handleQualityChange);
    elements.copyCssBtn.addEventListener('click', copyCssToClipboard);
    elements.exportBtn.addEventListener('click', handleExport);

    // Preview canvas interactions
    elements.previewCanvas.addEventListener('click', handleCanvasClick);
    elements.focalPointMarker.addEventListener('mousedown', startFocalDrag);
    elements.resizeHandle.addEventListener('mousedown', startCornerDrag);

    // Mouse move and up handlers
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

// Check WebP support
function checkWebPSupport() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}

// Handle image upload
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check for HEIC
    if (file.name.toLowerCase().endsWith('.heic') || 
        file.name.toLowerCase().endsWith('.heif') ||
        file.type === 'image/heic' || 
        file.type === 'image/heif') {
        elements.heicWarning.style.display = 'block';
    } else {
        elements.heicWarning.style.display = 'none';
    }

    try {
        // Create image bitmap for EXIF handling
        const imageBitmap = await createImageBitmap(file);
        state.sourceImageBitmap = imageBitmap;
        
        // Also create Image object for canvas drawing
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = () => {
            URL.revokeObjectURL(url);
            state.sourceImage = img;
            setupPreviewCanvas();
            // Set default focal point to center
            state.focalPoint = {
                x: img.width / 2,
                y: img.height / 2
            };
            elements.controlsSection.style.display = 'block';
            elements.previewSection.style.display = 'block';
            elements.outputSection.style.display = 'block';
            elements.exportSection.style.display = 'block';
            updatePreview();
            updateCssOutput();
        };
        
        img.src = url;
    } catch (error) {
        console.error('Error loading image:', error);
        alert('Error loading image. Please try a different file.');
    }
}

// Setup preview canvas with scaling for large images
function setupPreviewCanvas() {
    const maxPreviewWidth = 1920;
    const img = state.sourceImage;
    
    // Calculate scale factor to fit preview
    if (img.width > maxPreviewWidth) {
        state.scaleFactor = maxPreviewWidth / img.width;
    } else {
        state.scaleFactor = 1;
    }
    
    const previewWidth = img.width * state.scaleFactor;
    const previewHeight = img.height * state.scaleFactor;
    
    elements.previewCanvas.width = previewWidth;
    elements.previewCanvas.height = previewHeight;
    elements.previewCanvas.style.width = `${previewWidth}px`;
    elements.previewCanvas.style.height = `${previewHeight}px`;
    
    state.previewCtx = elements.previewCanvas.getContext('2d');
    
    // Update preview info
    elements.previewInfo.textContent = 
        `Preview: ${Math.round(previewWidth)}×${Math.round(previewHeight)}px (Source: ${img.width}×${img.height}px)`;
}

// Handle aspect ratio preset
function handleAspectRatioPreset(ratioString) {
    const [w, h] = ratioString.split(':').map(Number);
    state.aspectRatio = { width: w, height: h };
    state.isCustomRatio = false;
    
    // Update active button
    elements.presetButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ratio === ratioString);
    });
    
    // Hide resize handle
    elements.resizeHandle.style.display = 'none';
    
    updateDimensionInfo();
    updatePreview();
}

// Handle width change
function handleWidthChange() {
    state.outputWidth = parseInt(elements.widthSelect.value);
    updateDimensionInfo();
    updatePreview();
}

// Update dimension info
function updateDimensionInfo() {
    const height = Math.round((state.outputWidth * state.aspectRatio.height) / state.aspectRatio.width);
    elements.dimensionInfo.textContent = `Height: ${height}px`;
}

// Handle format change
function handleFormatChange() {
    const format = elements.formatSelect.value;
    elements.qualityGroup.style.display = format === 'image/jpeg' ? 'block' : 'none';
}

// Handle quality change
function handleQualityChange() {
    elements.qualityValue.textContent = `${elements.qualitySlider.value}%`;
}

// Handle canvas click (place focal point)
function handleCanvasClick(event) {
    if (state.isDraggingFocal || state.isDraggingCorner) return;
    
    const canvas = elements.previewCanvas;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // Convert click position in preview canvas to source image coordinates
    const cropInfo = calculateCropArea();
    
    // Click position relative to preview canvas (0 to canvas.width/height)
    const relativeX = clickX / canvas.width;
    const relativeY = clickY / canvas.height;
    
    // Convert to source image coordinates
    const sourceX = cropInfo.sourceX + (relativeX * cropInfo.sourceWidth);
    const sourceY = cropInfo.sourceY + (relativeY * cropInfo.sourceHeight);
    
    // Clamp to image bounds
    const img = state.sourceImage;
    state.focalPoint = {
        x: Math.max(0, Math.min(img.width, sourceX)),
        y: Math.max(0, Math.min(img.height, sourceY))
    };
    
    updateFocalPointMarker();
    updatePreview();
    updateCssOutput();
}

// Start dragging focal point
function startFocalDrag(event) {
    event.stopPropagation();
    state.isDraggingFocal = true;
    const rect = elements.focalPointMarker.getBoundingClientRect();
    state.dragOffset = {
        x: event.clientX - (rect.left + rect.width / 2),
        y: event.clientY - (rect.top + rect.height / 2)
    };
}

// Start dragging corner (custom aspect ratio)
function startCornerDrag(event) {
    event.stopPropagation();
    state.isDraggingCorner = true;
    const canvas = elements.previewCanvas;
    state.customRatioStart = {
        width: canvas.width,
        height: canvas.height,
        mouseX: event.clientX,
        mouseY: event.clientY
    };
}

// Handle mouse move
function handleMouseMove(event) {
    if (state.isDraggingFocal) {
        const canvas = elements.previewCanvas;
        const rect = canvas.getBoundingClientRect();
        let x = event.clientX - rect.left - state.dragOffset.x;
        let y = event.clientY - rect.top - state.dragOffset.y;
        
        // Convert preview canvas coordinates to source image coordinates
        const cropInfo = calculateCropArea();
        
        // Position relative to preview canvas
        const relativeX = x / canvas.width;
        const relativeY = y / canvas.height;
        
        // Convert to source image coordinates
        const sourceX = cropInfo.sourceX + (relativeX * cropInfo.sourceWidth);
        const sourceY = cropInfo.sourceY + (relativeY * cropInfo.sourceHeight);
        
        // Clamp to image bounds
        const img = state.sourceImage;
        state.focalPoint = {
            x: Math.max(0, Math.min(img.width, sourceX)),
            y: Math.max(0, Math.min(img.height, sourceY))
        };
        
        updateFocalPointMarker();
        updatePreview();
        updateCssOutput();
    } else if (state.isDraggingCorner && state.customRatioStart) {
        const rect = elements.previewCanvas.getBoundingClientRect();
        const deltaX = event.clientX - state.customRatioStart.mouseX;
        const deltaY = event.clientY - state.customRatioStart.mouseY;
        
        // Calculate new dimensions
        const newWidth = Math.max(100, state.customRatioStart.width + deltaX);
        const newHeight = Math.max(100, state.customRatioStart.height + deltaY);
        
        // Calculate aspect ratio from dimensions (convert to source coordinates for accuracy)
        const sourceWidth = newWidth / state.scaleFactor;
        const sourceHeight = newHeight / state.scaleFactor;
        const ratio = sourceWidth / sourceHeight;
        state.aspectRatio = { width: ratio, height: 1 };
        state.isCustomRatio = true;
        
        // Update active preset buttons
        elements.presetButtons.forEach(btn => btn.classList.remove('active'));
        
        updateDimensionInfo();
        updatePreview();
    }
}

// Handle mouse up
function handleMouseUp() {
    state.isDraggingFocal = false;
    state.isDraggingCorner = false;
}

// Update focal point marker position
function updateFocalPointMarker() {
    if (!state.focalPoint) {
        elements.focalPointMarker.style.display = 'none';
        return;
    }
    
    // Calculate where the focal point appears in the cropped preview
    const cropInfo = calculateCropArea();
    
    // Check if focal point is within the crop area
    const isInCrop = state.focalPoint.x >= cropInfo.sourceX && 
                     state.focalPoint.x <= cropInfo.sourceX + cropInfo.sourceWidth &&
                     state.focalPoint.y >= cropInfo.sourceY && 
                     state.focalPoint.y <= cropInfo.sourceY + cropInfo.sourceHeight;
    
    if (!isInCrop) {
        elements.focalPointMarker.style.display = 'none';
        return;
    }
    
    // Convert source coordinates to preview canvas coordinates
    // Focal point position relative to crop area
    const relativeX = state.focalPoint.x - cropInfo.sourceX;
    const relativeY = state.focalPoint.y - cropInfo.sourceY;
    
    // Scale to preview canvas size
    const canvas = elements.previewCanvas;
    const previewX = (relativeX / cropInfo.sourceWidth) * canvas.width;
    const previewY = (relativeY / cropInfo.sourceHeight) * canvas.height;
    
    elements.focalPointMarker.style.display = 'block';
    elements.focalPointMarker.style.left = `${previewX}px`;
    elements.focalPointMarker.style.top = `${previewY}px`;
}

// Update preview
function updatePreview() {
    if (!state.sourceImage || !state.previewCtx) return;
    
    const img = state.sourceImage;
    const ctx = state.previewCtx;
    const canvas = elements.previewCanvas;
    
    // Calculate crop area based on aspect ratio and focal point
    const cropInfo = calculateCropArea();
    
    // Calculate preview dimensions maintaining aspect ratio
    // Use the crop dimensions scaled by the scale factor
    const targetAspect = state.aspectRatio.width / state.aspectRatio.height;
    const maxPreviewWidth = 1920;
    
    // Calculate preview size based on crop area, but cap at max width
    let previewWidth = cropInfo.sourceWidth * state.scaleFactor;
    let previewHeight = cropInfo.sourceHeight * state.scaleFactor;
    
    if (previewWidth > maxPreviewWidth) {
        previewWidth = maxPreviewWidth;
        previewHeight = previewWidth / targetAspect;
    }
    
    // Update canvas size if it changed
    if (canvas.width !== previewWidth || canvas.height !== previewHeight) {
        canvas.width = previewWidth;
        canvas.height = previewHeight;
        canvas.style.width = `${previewWidth}px`;
        canvas.style.height = `${previewHeight}px`;
    }
    
    // Clear and draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the cropped image section
    ctx.drawImage(
        img,
        cropInfo.sourceX, cropInfo.sourceY, cropInfo.sourceWidth, cropInfo.sourceHeight,
        0, 0, previewWidth, previewHeight
    );
    
    // Update crop overlay (hidden, but resize handle uses it)
    updateCropOverlay(cropInfo);
    
    // Update focal point marker
    updateFocalPointMarker();
}

// Calculate crop area based on aspect ratio and focal point
function calculateCropArea() {
    const img = state.sourceImage;
    const targetAspect = state.aspectRatio.width / state.aspectRatio.height;
    const imageAspect = img.width / img.height;
    
    let sourceWidth, sourceHeight, sourceX, sourceY;
    
    // Default focal point to center if not set
    const focalX = state.focalPoint ? state.focalPoint.x : img.width / 2;
    const focalY = state.focalPoint ? state.focalPoint.y : img.height / 2;
    
    if (imageAspect > targetAspect) {
        // Image is wider than target - crop width
        sourceHeight = img.height;
        sourceWidth = sourceHeight * targetAspect;
        
        // Position based on focal point
        sourceX = Math.max(0, Math.min(img.width - sourceWidth, focalX - sourceWidth / 2));
        sourceY = 0;
    } else {
        // Image is taller than target - crop height
        sourceWidth = img.width;
        sourceHeight = sourceWidth / targetAspect;
        
        // Position based on focal point
        sourceX = 0;
        sourceY = Math.max(0, Math.min(img.height - sourceHeight, focalY - sourceHeight / 2));
    }
    
    return { sourceX, sourceY, sourceWidth, sourceHeight };
}

// Update crop overlay
function updateCropOverlay(cropInfo) {
    // The overlay is hidden by default - the preview canvas itself shows the crop
    // But we can show it for debugging or as a reference
    const overlay = elements.cropOverlay;
    overlay.style.display = 'none'; // Hide overlay - preview canvas shows the crop
    
    // Position resize handle at bottom-right corner of preview canvas
    const canvas = elements.previewCanvas;
    elements.resizeHandle.style.display = 'block';
    const rect = canvas.getBoundingClientRect();
    const containerRect = canvas.parentElement.getBoundingClientRect();
    elements.resizeHandle.style.left = `${rect.width - 10}px`;
    elements.resizeHandle.style.top = `${rect.height - 10}px`;
}

// Update CSS output
function updateCssOutput() {
    if (!state.focalPoint || !state.sourceImage) {
        return;
    }
    
    const img = state.sourceImage;
    const xPercent = ((state.focalPoint.x / img.width) * 100).toFixed(2);
    const yPercent = ((state.focalPoint.y / img.height) * 100).toFixed(2);
    
    const css = `object-fit: cover;
object-position: ${xPercent}% ${yPercent}%;`;
    
    elements.cssOutput.textContent = css;
}

// Copy CSS to clipboard
async function copyCssToClipboard() {
    const css = elements.cssOutput.textContent;
    try {
        await navigator.clipboard.writeText(css);
        const originalText = elements.copyCssBtn.textContent;
        elements.copyCssBtn.textContent = 'Copied!';
        elements.copyCssBtn.style.background = 'var(--success-color)';
        setTimeout(() => {
            elements.copyCssBtn.textContent = originalText;
            elements.copyCssBtn.style.background = '';
        }, 2000);
    } catch (error) {
        console.error('Failed to copy:', error);
        alert('Failed to copy to clipboard');
    }
}

// Handle export
async function handleExport() {
    if (!state.sourceImage || !state.sourceImageBitmap) {
        alert('Please upload an image first');
        return;
    }
    
    try {
        // Calculate output dimensions
        const outputHeight = Math.round((state.outputWidth * state.aspectRatio.height) / state.aspectRatio.width);
        
        // Create export canvas at full resolution
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = state.outputWidth;
        exportCanvas.height = outputHeight;
        const exportCtx = exportCanvas.getContext('2d');
        
        // Calculate crop area in full source image coordinates
        const cropInfo = calculateCropArea();
        
        // Draw from full source image to export canvas
        exportCtx.drawImage(
            state.sourceImage,
            cropInfo.sourceX, cropInfo.sourceY, cropInfo.sourceWidth, cropInfo.sourceHeight,
            0, 0, state.outputWidth, outputHeight
        );
        
        // Get export format and quality
        const format = elements.formatSelect.value;
        const quality = format === 'image/jpeg' ? elements.qualitySlider.value / 100 : undefined;
        
        // Convert to blob and download
        exportCanvas.toBlob((blob) => {
            if (!blob) {
                alert('Export failed. Please try again.');
                return;
            }
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cropped-image-${state.outputWidth}x${outputHeight}.${format.split('/')[1]}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Clean up export canvas
            exportCanvas.width = 0;
            exportCanvas.height = 0;
        }, format, quality);
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed. Please try again.');
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
