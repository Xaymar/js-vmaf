# js-vmaf: Simple, but effective VMAF comparison tool
This is a simple wrapper around FFmpeg and VMAF to handle comparison of files.

```
$node . --help
usage: js-vmaf [--help] [--hide_banner] [-q] [-v] --ffmpeg FFMPEG --ffprobe FFPROBE [--vmaf VMAF] -r
               REFERENCE [-o OUTPUT] [--flip] [-cs COLOR_SPACE] [-cp COLOR_PRIMARIES] [-ct COLOR_TRC]
               [-cr COLOR_RANGE] [-p FORMAT] [-w WIDTH] [-h HEIGHT] [--fps FPS] [-f FEATURE] [-m MODEL]
               [-t THREADS]
               Path [Path ...]

A simple, yet effective tool to quickly compare one or more videos using VMAF.

positional arguments:
  Path                  One or more paths to a distorted file or a directory containing distorted files.

optional arguments:
  --help                show this help message and exit
  --hide_banner         Hide license banner.
  -q, --quiet           Be quiet.
  -v, --verbose         Be verbose.
  --ffmpeg FFMPEG       Path to the FFmpeg binary to use.
  --ffprobe FFPROBE     Path to the FFprobe binary to use.
  --vmaf VMAF           Path to the VMAF binary to use. Will fall back to FFmpeg if not provided
  -r REFERENCE, --reference REFERENCE
                        Reference file
  -o OUTPUT, --output OUTPUT
                        The file name, including formatters, for the output log file.
  --flip                Scale, convert and resample to distorted file instead of reference file.
  -cs COLOR_SPACE, --color_space COLOR_SPACE
                        Define the color space of the reference file.
  -cp COLOR_PRIMARIES, --color_primaries COLOR_PRIMARIES
                        Define the color primaries of the reference file.
  -ct COLOR_TRC, --color_trc COLOR_TRC
                        Define the color transfer characteristics of the reference file.
  -cr COLOR_RANGE, --color_range COLOR_RANGE
                        Define the color range of the reference file.
  -p FORMAT, --format FORMAT
                        Define the format for comparison.
  -w WIDTH, --width WIDTH
                        Define the width for the comparision.
  -h HEIGHT, --height HEIGHT
                        Define the height for the comparision.
  --fps FPS             Define the FPS for comparison.
  -f FEATURE, --feature FEATURE
                        Enable (and configure) a feature
  -m MODEL, --model MODEL
                        Enable (and configure) a model
  -t THREADS, --threads THREADS
                        Number of threads to use.
```


## Installing
```
npm install
npm run build
```

## Examples

##### Compare all files in a directory
```
$(prog) --ffmpeg ffmpeg --ffprobe ffprobe -r /mnt/usb0/ref.mp4 /mnt/usb1/
```

##### Use the distorted files as the target size
The following command converts the reference to the same format, resolution, framerate and color as the distorted files. Ideal for bitrate optimization.
```
$(prog) --ffmpeg ffmpeg --ffprobe ffprobe --flip -r /mnt/usb0/ref.mp4 /mnt/usb1/
```

##### Resize everything to 1080p and convert to yuv420p
```
$(prog) --ffmpeg ffmpeg --ffprobe ffprobe -h 1080 -p yuv420p -r /mnt/usb0/ref.mp4 /mnt/usb1/
```
