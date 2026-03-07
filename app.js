// State management
const state = {
    sourceImage: null,
    sourceImageBitmap: null,
    previewCanvas: null,
    previewCtx: null,
    aspectRatio: { width: 16, height: 9 },
    outputWidth: 1920,
    scaleFactor: 1, // Preview scale factor for large images
    imageScale: 1, // Zoom level (1.0 = minimum to cover crop area)
    imageOffset: { x: 0, y: 0 }, // Pan offset
    isDraggingImage: false,
    dragStart: { x: 0, y: 0 },
    dragStartOffset: { x: 0, y: 0 },
    isCustomRatio: false,
    customRatioStart: null,
    isDraggingCorner: false
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
    elements.previewCanvas.addEventListener('mousedown', startImageDrag);
    elements.previewCanvas.addEventListener('wheel', handleWheel, { passive: false });
    elements.resizeHandle.addEventListener('mousedown', startCornerDrag);

    // Mouse move and up handlers
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Window resize handler to update canvas size
    window.addEventListener('resize', () => {
        if (state.sourceImage) {
            updatePreviewCanvasSize();
            // Recalculate minimum and maximum scales after resize
            const minScale = getMinimumScale();
            const maxScale = getMaximumScale();
            // Clamp scale to valid range
            state.imageScale = Math.max(minScale, Math.min(state.imageScale, maxScale));
            initializeImagePosition();
            updatePreview();
        }
    });
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
            
            // Detect and set aspect ratio to match image
            detectAndSetImageAspectRatio(img);
            
            setupPreviewCanvas();
            initializeImagePosition();
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
    
    state.previewCtx = elements.previewCanvas.getContext('2d');
    // Disable image smoothing for crisp rendering
    state.previewCtx.imageSmoothingEnabled = false;
    updatePreviewCanvasSize();
}

// Update preview canvas size based on crop rectangle
function updatePreviewCanvasSize() {
    const targetAspect = state.aspectRatio.width / state.aspectRatio.height;
    
    // Get container width to make it responsive but maintain aspect ratio
    const container = elements.previewCanvas.parentElement;
    const containerWidth = Math.min(container.clientWidth || 1920, 1920);
    const maxPreviewWidth = containerWidth - 20; // Account for padding/border
    
    // Calculate dimensions maintaining aspect ratio
    let previewWidth = maxPreviewWidth;
    let previewHeight = previewWidth / targetAspect;
    
    // Limit height to 80vh (viewport height)
    const maxHeight = Math.min(window.innerHeight * 0.8, 1080);
    if (previewHeight > maxHeight) {
        previewHeight = maxHeight;
        previewWidth = previewHeight * targetAspect;
    }
    
    // Set canvas internal resolution (for crisp rendering)
    const devicePixelRatio = window.devicePixelRatio || 1;
    const oldWidth = elements.previewCanvas.width;
    const oldHeight = elements.previewCanvas.height;
    
    elements.previewCanvas.width = previewWidth * devicePixelRatio;
    elements.previewCanvas.height = previewHeight * devicePixelRatio;
    
    // Set CSS size (maintains aspect ratio)
    elements.previewCanvas.style.width = `${previewWidth}px`;
    elements.previewCanvas.style.height = `${previewHeight}px`;
    
    // Scale context for high DPI displays (only if canvas size changed or context is new)
    if (state.previewCtx && (oldWidth !== elements.previewCanvas.width || oldHeight !== elements.previewCanvas.height)) {
        // Reset transform and set new scale
        state.previewCtx.setTransform(1, 0, 0, 1, 0, 0);
        state.previewCtx.scale(devicePixelRatio, devicePixelRatio);
        // Ensure image smoothing is disabled for crisp rendering
        state.previewCtx.imageSmoothingEnabled = false;
    }
    
    // Update preview info
    if (state.sourceImage) {
        elements.previewInfo.textContent = 
            `Preview: ${Math.round(previewWidth)}×${Math.round(previewHeight)}px (Source: ${state.sourceImage.width}×${state.sourceImage.height}px)`;
    }
}

// Get minimum scale to ensure crop area is always covered (object-fit: cover behavior)
// Returns 1.0 as the base scale (minimum to cover), user can zoom in from there
function getMinimumScale() {
    // Always return 1.0 - this is the minimum scale where image just covers crop
    // The actual scaling is handled in updatePreview
    return 1.0;
}

// Get maximum scale (100% = 1:1 pixel ratio with output size, no upscaling)
function getMaximumScale() {
    if (!state.sourceImage) return 1.0;
    
    const img = state.sourceImage;
    
    // Calculate output dimensions
    const outputWidth = state.outputWidth;
    const outputHeight = Math.round((outputWidth * state.aspectRatio.height) / state.aspectRatio.width);
    
    // Calculate base cover scale (needed to understand current display scaling)
    const cropRect = getCropRect();
    const imageAspect = img.width / img.height;
    const cropAspect = cropRect.width / cropRect.height;
    const outputAspect = outputWidth / outputHeight;
    
    let baseCoverScale;
    if (imageAspect > cropAspect) {
        baseCoverScale = cropRect.height / img.height;
    } else {
        baseCoverScale = cropRect.width / img.width;
    }
    
    // Maximum scale: when the visible portion of source image equals output dimensions
    // At imageScale = 1.0: image covers preview crop (one dimension matches cropRect)
    // At maxScale: we want the visible source pixels to equal output pixels (1:1)
    
    // The visible crop area in source coordinates depends on the display scale
    // We need to find when: visibleSourceWidth = outputWidth OR visibleSourceHeight = outputHeight
    
    // At any scale, the visible area is the crop rectangle mapped to source coordinates
    // The mapping depends on: displayDimension = sourceDimension * baseCoverScale * imageScale
    // So: visibleSourceDimension = cropRectDimension / (baseCoverScale * imageScale)
    
    // At maxScale, we want: visibleSourceDimension = outputDimension
    // So: outputDimension = cropRectDimension / (baseCoverScale * maxScale)
    // Therefore: maxScale = cropRectDimension / (baseCoverScale * outputDimension)
    
    let maxScale;
    if (imageAspect > outputAspect) {
        // Image is wider than output - height will be the matching dimension
        // At max: visibleSourceHeight = outputHeight
        // visibleSourceHeight = cropRect.height / (baseCoverScale * maxScale)
        // So: outputHeight = cropRect.height / (baseCoverScale * maxScale)
        // maxScale = cropRect.height / (baseCoverScale * outputHeight)
        maxScale = cropRect.height / (baseCoverScale * outputHeight);
    } else {
        // Image is taller than output - width will be the matching dimension
        // At max: visibleSourceWidth = outputWidth
        // maxScale = cropRect.width / (baseCoverScale * outputWidth)
        maxScale = cropRect.width / (baseCoverScale * outputWidth);
    }
    
    return maxScale;
}

// Initialize image position and scale
function initializeImagePosition() {
    // Start at minimum scale to show as much of image as possible
    // while still covering the crop area
    state.imageScale = getMinimumScale();
    state.imageOffset = { x: 0, y: 0 };
}

// Get crop rectangle in preview canvas coordinates (CSS pixels, not device pixels)
function getCropRect() {
    const canvas = elements.previewCanvas;
    // Return CSS pixel dimensions, not internal canvas resolution
    // Calculate from canvas dimensions divided by devicePixelRatio
    const devicePixelRatio = window.devicePixelRatio || 1;
    const cssWidth = canvas.width / devicePixelRatio;
    const cssHeight = canvas.height / devicePixelRatio;
    return {
        x: 0,
        y: 0,
        width: cssWidth,
        height: cssHeight
    };
}

// Detect image aspect ratio and set it as default
function detectAndSetImageAspectRatio(img) {
    const imageAspect = img.width / img.height;
    
    // Preset aspect ratios
    const presets = [
        { ratio: '21:9', value: 21/9, width: 21, height: 9 },
        { ratio: '16:9', value: 16/9, width: 16, height: 9 },
        { ratio: '3:2', value: 3/2, width: 3, height: 2 },
        { ratio: '4:3', value: 4/3, width: 4, height: 3 },
        { ratio: '1:1', value: 1/1, width: 1, height: 1 },
        { ratio: '3:4', value: 3/4, width: 3, height: 4 },
        { ratio: '2:3', value: 2/3, width: 2, height: 3 }
    ];
    
    // Find closest matching preset (within 2% tolerance)
    let closestPreset = null;
    let minDifference = Infinity;
    const tolerance = 0.02;
    
    for (const preset of presets) {
        const difference = Math.abs(imageAspect - preset.value);
        if (difference < minDifference && difference < tolerance) {
            minDifference = difference;
            closestPreset = preset;
        }
    }
    
    if (closestPreset) {
        // Use matching preset
        state.aspectRatio = { width: closestPreset.width, height: closestPreset.height };
        state.isCustomRatio = false;
        
        // Highlight the matching button
        elements.presetButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.ratio === closestPreset.ratio);
        });
    } else {
        // Use image's actual aspect ratio as custom
        // Simplify to a reasonable ratio (find greatest common divisor approximation)
        const simplified = simplifyRatio(img.width, img.height);
        state.aspectRatio = { width: simplified.width, height: simplified.height };
        state.isCustomRatio = true;
        
        // Clear all preset highlights
        elements.presetButtons.forEach(btn => btn.classList.remove('active'));
    }
}

// Simplify ratio to reasonable numbers (approximate GCD)
function simplifyRatio(width, height) {
    // Use a tolerance to find approximate ratio
    const maxDenominator = 100;
    let bestRatio = { width: width, height: height };
    let bestError = Infinity;
    
    for (let h = 1; h <= maxDenominator; h++) {
        const w = Math.round((width / height) * h);
        if (w < 1 || w > maxDenominator * 10) continue;
        
        const error = Math.abs((width / height) - (w / h));
        if (error < bestError) {
            bestError = error;
            bestRatio = { width: w, height: h };
            
            // If error is very small, we found a good match
            if (error < 0.001) break;
        }
    }
    
    return bestRatio;
}

// Handle aspect ratio preset
function handleAspectRatioPreset(ratioString) {
    const [w, h] = ratioString.split(':').map(Number);
    state.aspectRatio = { width: w, height: h };
    state.isCustomRatio = false;
    
    // Update active button - highlight selected, remove highlight from others
    elements.presetButtons.forEach(btn => {
        if (btn.dataset.ratio === ratioString) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Reinitialize image position for new aspect ratio
    if (state.sourceImage) {
        updatePreviewCanvasSize();
        // Recalculate max scale and clamp current scale
        const maxScale = getMaximumScale();
        state.imageScale = Math.min(state.imageScale, maxScale);
        initializeImagePosition();
    }
    
    updateDimensionInfo();
    updatePreview();
    updateCssOutput();
}

// Handle width change
function handleWidthChange() {
    state.outputWidth = parseInt(elements.widthSelect.value);
    
    // Recalculate max scale and clamp current scale if needed
    if (state.sourceImage) {
        const maxScale = getMaximumScale();
        state.imageScale = Math.min(state.imageScale, maxScale);
        updatePreview();
    }
    
    updateDimensionInfo();
    updateCssOutput();
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

// Start dragging image (panning)
function startImageDrag(event) {
    if (state.isDraggingCorner) return;
    state.isDraggingImage = true;
    state.dragStart = { x: event.clientX, y: event.clientY };
    state.dragStartOffset = { ...state.imageOffset };
    event.preventDefault();
}

// Handle wheel (zooming)
function handleWheel(event) {
    event.preventDefault();
    
    const canvas = elements.previewCanvas;
    const rect = canvas.getBoundingClientRect();
    // Convert mouse position to canvas coordinates (account for devicePixelRatio)
    const devicePixelRatio = window.devicePixelRatio || 1;
    const mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
    
    // Zoom factor
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newScale = state.imageScale * zoomFactor;
    
    // Get minimum and maximum scales
    const minScale = getMinimumScale();
    const maxScale = getMaximumScale();
    
    // Clamp scale - minimum to ensure crop is always covered, max at 100% (1:1 pixel ratio)
    const clampedScale = Math.max(minScale, Math.min(newScale, maxScale));
    
    // If scale didn't change (hit limit), don't update
    if (clampedScale === state.imageScale) return;
    
    // Zoom towards mouse position
    const cropRect = getCropRect();
    const scaleChange = clampedScale / state.imageScale;
    
    // Mouse position relative to crop center (convert from canvas pixels to crop coordinates)
    const cropCenterX = cropRect.width / 2;
    const cropCenterY = cropRect.height / 2;
    const mouseCropX = mouseX / devicePixelRatio;
    const mouseCropY = mouseY / devicePixelRatio;
    
    // Current image center in crop coordinates
    const imageCenterX = cropCenterX + state.imageOffset.x;
    const imageCenterY = cropCenterY + state.imageOffset.y;
    
    // Vector from image center to mouse
    const deltaX = mouseCropX - imageCenterX;
    const deltaY = mouseCropY - imageCenterY;
    
    // Adjust offset to zoom towards mouse (scale the delta)
    state.imageOffset.x -= deltaX * (1 - scaleChange);
    state.imageOffset.y -= deltaY * (1 - scaleChange);
    
    state.imageScale = clampedScale;
    
    // Constrain after zoom to ensure crop is still covered
    constrainImagePosition();
    
    updatePreview();
    updateCssOutput();
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
    if (state.isDraggingImage) {
        const deltaX = event.clientX - state.dragStart.x;
        const deltaY = event.clientY - state.dragStart.y;
        
        state.imageOffset.x = state.dragStartOffset.x + deltaX;
        state.imageOffset.y = state.dragStartOffset.y + deltaY;
        
        // Constrain image to stay within reasonable bounds
        constrainImagePosition();
        
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
        
        // Reinitialize image position for new aspect ratio
        if (state.sourceImage) {
            updatePreviewCanvasSize();
            // Recalculate max scale and clamp current scale
            const maxScale = getMaximumScale();
            state.imageScale = Math.min(state.imageScale, maxScale);
            initializeImagePosition();
        }
        
        updateDimensionInfo();
        updatePreview();
        updateCssOutput();
    }
}

// Handle mouse up
function handleMouseUp() {
    state.isDraggingImage = false;
    state.isDraggingCorner = false;
}

// Constrain image position to ensure crop area is always covered (object-fit: cover)
function constrainImagePosition() {
    const img = state.sourceImage;
    if (!img) return;
    
    const cropRect = getCropRect();
    
    // Calculate display dimensions (same logic as in updatePreview)
    const imageAspect = img.width / img.height;
    const cropAspect = cropRect.width / cropRect.height;
    
    let baseCoverScale;
    if (imageAspect > cropAspect) {
        baseCoverScale = cropRect.height / img.height;
    } else {
        baseCoverScale = cropRect.width / img.width;
    }
    
    const totalScale = baseCoverScale * state.imageScale;
    const displayWidth = img.width * totalScale;
    const displayHeight = img.height * totalScale;
    
    // Crop center
    const cropCenterX = cropRect.width / 2;
    const cropCenterY = cropRect.height / 2;
    
    // Image center position (relative to crop center)
    const imageCenterX = cropCenterX + state.imageOffset.x;
    const imageCenterY = cropCenterY + state.imageOffset.y;
    
    // Calculate bounds to ensure crop area is always covered
    const imageLeft = imageCenterX - displayWidth / 2;
    const imageRight = imageCenterX + displayWidth / 2;
    const imageTop = imageCenterY - displayHeight / 2;
    const imageBottom = imageCenterY + displayHeight / 2;
    
    // Constrain so crop is always covered
    let constrainedOffsetX = state.imageOffset.x;
    let constrainedOffsetY = state.imageOffset.y;
    
    if (imageLeft > 0) {
        // Image too far right, move left
        constrainedOffsetX -= (imageLeft - 0);
    } else if (imageRight < cropRect.width) {
        // Image too far left, move right
        constrainedOffsetX += (cropRect.width - imageRight);
    }
    
    if (imageTop > 0) {
        // Image too far down, move up
        constrainedOffsetY -= (imageTop - 0);
    } else if (imageBottom < cropRect.height) {
        // Image too far up, move down
        constrainedOffsetY += (cropRect.height - imageBottom);
    }
    
    state.imageOffset.x = constrainedOffsetX;
    state.imageOffset.y = constrainedOffsetY;
}


// Update preview
function updatePreview() {
    if (!state.sourceImage || !state.previewCtx) return;
    
    const img = state.sourceImage;
    const ctx = state.previewCtx;
    const canvas = elements.previewCanvas;
    const cropRect = getCropRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Clear canvas (context is already scaled, so use CSS pixel dimensions)
    ctx.clearRect(0, 0, cropRect.width, cropRect.height);
    
    // Calculate display dimensions for object-fit: cover behavior
    // Scale the image so one dimension matches crop exactly, the other overflows
    const imageAspect = img.width / img.height;
    const cropAspect = cropRect.width / cropRect.height;
    
    // Calculate the scale needed so image covers crop (at imageScale = 1.0)
    let baseCoverScale;
    if (imageAspect > cropAspect) {
        // Image wider - scale so height matches crop height exactly
        baseCoverScale = cropRect.height / img.height;
    } else {
        // Image taller - scale so width matches crop width exactly
        baseCoverScale = cropRect.width / img.width;
    }
    
    // Apply the user's zoom scale on top of the base cover scale
    const totalScale = baseCoverScale * state.imageScale;
    
    // Calculate final display dimensions (in CSS pixels)
    const displayWidth = img.width * totalScale;
    const displayHeight = img.height * totalScale;
    
    // Calculate image position (centered in crop rect, then offset) - in CSS pixels
    // Round to avoid sub-pixel rendering artifacts
    const imageX = Math.round((cropRect.width / 2) - (displayWidth / 2) + state.imageOffset.x);
    const imageY = Math.round((cropRect.height / 2) - (displayHeight / 2) + state.imageOffset.y);
    const displayWidthRounded = Math.round(displayWidth);
    const displayHeightRounded = Math.round(displayHeight);
    
    // Draw image (context is already scaled, so use CSS pixel coordinates)
    // Use rounded coordinates to avoid sub-pixel rendering
    ctx.drawImage(
        img,
        imageX, 
        imageY, 
        displayWidthRounded, 
        displayHeightRounded
    );
    
    // Draw crop rectangle overlay (border) - use CSS pixel coordinates
    // Round coordinates to avoid sub-pixel rendering artifacts
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(Math.round(0), Math.round(0), Math.round(cropRect.width), Math.round(cropRect.height));
    ctx.setLineDash([]);
    
    // Update resize handle
    updateResizeHandle();
}

// Calculate what portion of source image is visible in crop rectangle
function calculateVisibleCropArea() {
    const img = state.sourceImage;
    const cropRect = getCropRect();
    
    // Calculate display dimensions (same logic as updatePreview)
    const imageAspect = img.width / img.height;
    const cropAspect = cropRect.width / cropRect.height;
    
    let baseCoverScale;
    if (imageAspect > cropAspect) {
        baseCoverScale = cropRect.height / img.height;
    } else {
        baseCoverScale = cropRect.width / img.width;
    }
    
    const totalScale = baseCoverScale * state.imageScale;
    const displayWidth = img.width * totalScale;
    const displayHeight = img.height * totalScale;
    
    // Image position in crop rectangle coordinates
    const imageX = (cropRect.width / 2) - (displayWidth / 2) + state.imageOffset.x;
    const imageY = (cropRect.height / 2) - (displayHeight / 2) + state.imageOffset.y;
    
    // The crop rectangle is the entire canvas (0, 0, cropRect.width, cropRect.height)
    // We need to map this rectangle to source image coordinates
    
    // The crop rectangle corners in crop coordinates:
    // Top-left: (0, 0)
    // Bottom-right: (cropRect.width, cropRect.height)
    
    // Convert these corners to image-relative coordinates
    // Top-left corner of crop in image coordinates
    const cropTopLeftX = 0 - imageX;
    const cropTopLeftY = 0 - imageY;
    
    // Bottom-right corner of crop in image coordinates
    const cropBottomRightX = cropRect.width - imageX;
    const cropBottomRightY = cropRect.height - imageY;
    
    // Convert to source image coordinates (0 to img.width/height)
    const sourceX = (cropTopLeftX / displayWidth) * img.width;
    const sourceY = (cropTopLeftY / displayHeight) * img.height;
    const sourceWidth = ((cropBottomRightX - cropTopLeftX) / displayWidth) * img.width;
    const sourceHeight = ((cropBottomRightY - cropTopLeftY) / displayHeight) * img.height;
    
    return {
        sourceX: Math.max(0, Math.min(img.width, sourceX)),
        sourceY: Math.max(0, Math.min(img.height, sourceY)),
        sourceWidth: Math.max(0, Math.min(img.width - sourceX, sourceWidth)),
        sourceHeight: Math.max(0, Math.min(img.height - sourceY, sourceHeight))
    };
}

// Calculate object-position percentage based on current image position
function calculateObjectPosition() {
    const img = state.sourceImage;
    const cropRect = getCropRect();
    
    // Calculate display dimensions (same logic as updatePreview)
    const imageAspect = img.width / img.height;
    const cropAspect = cropRect.width / cropRect.height;
    
    let baseCoverScale;
    if (imageAspect > cropAspect) {
        baseCoverScale = cropRect.height / img.height;
    } else {
        baseCoverScale = cropRect.width / img.width;
    }
    
    const totalScale = baseCoverScale * state.imageScale;
    const displayWidth = img.width * totalScale;
    const displayHeight = img.height * totalScale;
    
    const imageX = (cropRect.width / 2) - (displayWidth / 2) + state.imageOffset.x;
    const imageY = (cropRect.height / 2) - (displayHeight / 2) + state.imageOffset.y;
    
    // Center of crop rect in image coordinates
    const cropCenterX = cropRect.width / 2;
    const cropCenterY = cropRect.height / 2;
    
    // Convert to image-relative coordinates
    const imageRelX = cropCenterX - imageX;
    const imageRelY = cropCenterY - imageY;
    
    // Convert to percentage of source image
    const xPercent = (imageRelX / displayWidth) * 100;
    const yPercent = (imageRelY / displayHeight) * 100;
    
    return {
        x: Math.max(0, Math.min(100, xPercent)),
        y: Math.max(0, Math.min(100, yPercent))
    };
}

// Update resize handle position
function updateResizeHandle() {
    const canvas = elements.previewCanvas;
    if (state.isCustomRatio) {
        elements.resizeHandle.style.display = 'block';
        elements.resizeHandle.style.left = `${canvas.width - 10}px`;
        elements.resizeHandle.style.top = `${canvas.height - 10}px`;
    } else {
        elements.resizeHandle.style.display = 'none';
    }
}

// Update CSS output
function updateCssOutput() {
    if (!state.sourceImage) {
        return;
    }
    
    const pos = calculateObjectPosition();
    const xPercent = pos.x.toFixed(2);
    const yPercent = pos.y.toFixed(2);
    
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
        
        // Calculate visible crop area in full source image coordinates
        const cropInfo = calculateVisibleCropArea();
        
        // Calculate the aspect ratio of the crop area vs the source crop
        const cropAspect = state.aspectRatio.width / state.aspectRatio.height;
        const sourceCropAspect = cropInfo.sourceWidth / cropInfo.sourceHeight;
        
        // Determine how to crop: always crop, never stretch
        let exportSourceX = cropInfo.sourceX;
        let exportSourceY = cropInfo.sourceY;
        let exportSourceWidth = cropInfo.sourceWidth;
        let exportSourceHeight = cropInfo.sourceHeight;
        
        if (sourceCropAspect > cropAspect) {
            // Source crop is wider than target - crop width (keep full height)
            exportSourceHeight = cropInfo.sourceHeight;
            exportSourceWidth = exportSourceHeight * cropAspect;
            // Keep the same top position - don't re-center, preserve user's positioning
            // The sourceX is already positioned correctly by the user in the preview
        } else {
            // Source crop is taller than target - crop height (keep full width)
            exportSourceWidth = cropInfo.sourceWidth;
            exportSourceHeight = exportSourceWidth / cropAspect;
            // Keep the same left position - don't re-center, preserve user's positioning
            // The sourceY is already positioned correctly by the user in the preview
        }
        
        // Clamp to image bounds and round to integers to avoid sub-pixel rendering
        exportSourceX = Math.round(Math.max(0, Math.min(state.sourceImage.width - exportSourceWidth, exportSourceX)));
        exportSourceY = Math.round(Math.max(0, Math.min(state.sourceImage.height - exportSourceHeight, exportSourceY)));
        exportSourceWidth = Math.round(Math.min(exportSourceWidth, state.sourceImage.width - exportSourceX));
        exportSourceHeight = Math.round(Math.min(exportSourceHeight, state.sourceImage.height - exportSourceY));
        
        // Draw from full source image to export canvas (always crop, never stretch)
        // Use integer coordinates for crisp rendering
        exportCtx.drawImage(
            state.sourceImage,
            exportSourceX, exportSourceY, exportSourceWidth, exportSourceHeight,
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
