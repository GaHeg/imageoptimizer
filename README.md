# Browser image optimizer

A client-side web tool for rescaling, cropping, and generating CSS `object-position` values from uploaded images. Perfect for students and web developers who need to prepare images without Photoshop or complex image editing software.

## Features

- **Client-side only** - Images never leave your browser, no server uploads
- **Large image support** - Handles 30MP+ images smoothly with scaled preview
- **Interactive focal point** - Click to place, drag to adjust the focal point
- **Template aspect ratios** - Hero (21:9), 16:9, 3:2, 4:3, 1:1, 3:4, 2:3
- **Custom aspect ratios** - Drag the corner of the preview to create any ratio
- **Multiple output widths** - 2560px, 1920px, 1280px, 1024px, 800px, 640px
- **Export formats** - JPEG (with quality control), PNG, WebP
- **CSS output** - Automatically generates `object-fit: cover` and `object-position` values

## How to Use

1. **Upload an image** - Click the upload button and select an image file
2. **Choose aspect ratio** - Select a preset template or drag the corner for custom
3. **Set output width** - Choose your desired output width from the dropdown
4. **Place focal point** - Click on the preview image where you want the focus
5. **Adjust focal point** - Drag the marker to fine-tune the position
6. **Copy CSS** - The `object-position` values update automatically - click "Copy CSS"
7. **Export image** - Click "Export Image" to download the cropped/resized image

## Using Images from iPhone

iPhones often save photos in HEIC format, which browsers don't support. Here are two ways to convert:

### Option 1: Change Camera Settings (Recommended)

1. Open **Settings** on your iPhone
2. Go to **Camera** → **Formats**
3. Select **Most Compatible** (saves as JPEG)

This will make all future photos save as JPEG, which works everywhere.

### Option 2: Convert from Photos App

1. Open the **Photos** app
2. Select the photo you want to use
3. Tap the **Share** button
4. Choose **Save as JPEG** or share to a Mac and convert there

## Technical Details

- Uses Canvas API for all image processing
- `createImageBitmap()` for proper EXIF orientation handling
- Dual-canvas architecture: scaled preview for smooth interaction, full-resolution export
- All calculations work in full image coordinates, ensuring export quality isn't limited by preview size
- No dependencies - pure vanilla JavaScript

## Browser Support

- Modern browsers with Canvas API support
- WebP export: Chrome, Edge, Firefox, Safari 16+
- JPEG and PNG: All modern browsers

## License

Free to use for any purpose.
