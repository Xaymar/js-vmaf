# js-vmaf: Simple, but effective VMAF comparison tool
This is a simple wrapper around FFmpeg and VMAF to handle comparison of files.

## Installing
```
npm install
npm run build
```

## Usage
```
node . --help
```

## Examples
### Compare all files in a directory
```
node . --ffmpeg ./ffmpeg --ffprobe ./ffprobe -r /mnt/usb0/reference.mp4 /mnt/usb1/
```
