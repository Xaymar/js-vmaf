/** A simple, but effective tool to quickly compare files with VMAF.
 *
 */

import { ArgumentParser } from "argparse";
import OS from "node:os";
import CHILD_PROCESS from "node:child_process";
import PROCESS from "node:process";
import PATH from "node:path";
import FS from "node:fs";

function valueOrDefault(value : any, fallback : any) : any {
	if (value === undefined) {
		return fallback;
	} else {
		return value;
	}
}

class App {
	private _argparse : ArgumentParser;
	private _args : any = {};
	private _ref : any = {};

	constructor() {
		this._argparse = new ArgumentParser({
			description: "A simple, yet effective tool to quickly compare one or more videos using VMAF.",
			add_help: true,
			// @ts-ignore:next-line
			conflict_handler: "resolve", // This is valid, but the @types/argparse definition doesn't have it.
			//usage: "%(prog)s [options] <distorted-directory-or-file> [<distorted-directory-or-file> ...]"
		});

		this._argparse.add_argument("--hide_banner", {
			action: "store_true",
			help: "Hide license banner."
		});
		this._argparse.add_argument("-q", "--quiet", {
			action: "store_true",
			help: "Be quiet."
		});
		this._argparse.add_argument("-v", "--verbose", {
			action: "store_true",
			help: "Be verbose."
		});

		this._argparse.add_argument("--ffmpeg", {
			type: "str",
			required: true,
			help: "Path to the FFmpeg binary to use."
		});
		this._argparse.add_argument("--ffprobe", {
			type: "str",
			required: true,
			help: "Path to the FFprobe binary to use."
		});
		this._argparse.add_argument("--vmaf", {
			type: "str",
			help: "Path to the VMAF binary to use. Will fall back to FFmpeg if not provided"
		});

		this._argparse.add_argument("-r", "--reference", {
			type: "str",
			required: true,
			help: "Reference file"
		});
		this._argparse.add_argument("-o", "--output", {
			type: "str",
			default: "${path}/${file}${ext}.json",
			help: "The file name, including formatters, for the output log file."
		});

		this._argparse.add_argument("--flip", {
			action: "store_true",
			default: false,
			help: "Scale, convert and resample to distorted file instead of reference file."
		});
		this._argparse.add_argument("-cs", "--color_space", {
			type: "str",
			help: "Define the color space of the reference file."
		});
		this._argparse.add_argument("-cp", "--color_primaries", {
			type: "str",
			help: "Define the color primaries of the reference file."
		});
		this._argparse.add_argument("-ct", "--color_trc", {
			type: "str",
			help: "Define the color transfer characteristics of the reference file."
		});
		this._argparse.add_argument("-cr", "--color_range", {
			type: "str",
			option_strings: [ "tv", "pc", "mpeg", "jpeg" ],
			help: "Define the color range of the reference file."
		});
		this._argparse.add_argument("-p", "--format", {
			type: "str",
			help: "Define the format for comparison."
		});
		this._argparse.add_argument("-w", "--width", {
			type: "int",
			help: "Define the width for the comparision."
		});
		this._argparse.add_argument("-h", "--height", {
			type: "int",
			help: "Define the height for the comparision."
		});
		this._argparse.add_argument("-t", "--fps", {
			type: "str",
			help: "Define the FPS for comparison."
		});

		this._argparse.add_argument("-f", "--feature", {
			type: "str",
			action: "append",
			default: [],
			help: "Enable (and configure) a feature"
		});

		this._argparse.add_argument("-m", "--model", {
			type: "str",
			action: "append",
			default: [ "version=vmaf_v0.6.1" ],
			help: "Enable (and configure) a model"
		});

		this._argparse.add_argument("-t", "--threads", {
			default: (OS.cpus().length / 3 * 2).toFixed(0),
			help: "Number of threads to use."
		});

		this._argparse.add_argument("distorted", {
			metavar: "Path",
			type: "str",
			nargs: "+",
			help: "One or more paths to a distorted file or a directory containing distorted files."
		});
	}

	license() {
		// Skip license banner if requested
		if (this._args.hide_banner) {
			return;
		}

		console.log(
			"Copyright 2022 Michael Fabian 'Xaymar' Dirks <info@xaymar.com>\n\
\n\
Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\
1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n\
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n\
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.\n\
\n\
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n"
		);
	}

	FFprobe(args : Array<string>) {
		args = [
			"-v", "quiet",
			"-print_format", "json",
			"-show_format",
			"-show_streams",
			"-show_programs",
			"-show_chapters",
			"-show_private_data",
			"-bitexact",
		].concat(args);

		if (this._args.verbose) console.log([this._args.ffprobe].concat(args).join(" "));
		const res = JSON.parse(CHILD_PROCESS.execFileSync(
			this._args.ffprobe,
			args,
			{ maxBuffer: 1073741824 }
		).toString("utf-8"));

		res.video = [];
		res.audio = [];
		res.subtitle = [];

		for (const stream of res.streams) {
			if (!res[stream.codec_type]) {
				res[stream.codec_type] = [];
			}
			if (stream.pix_fmt) stream.pix_fmt = this.fixFormat(stream.pix_fmt);
			stream.index = res[stream.codec_type].length;
			res[stream.codec_type].push(stream);
		}

		return res;
	}

	FFmpeg(args : Array<string>) {
		if (this._args.verbose) console.log([this._args.ffmpeg].concat(args).join(" "));
		return CHILD_PROCESS.execFile(
			this._args.ffmpeg,
			args,
			{ maxBuffer: 1073741824 }
		);
	}

	fixFormat(format : string) {
		switch (format) {
		case "yuvj420p":
			return "yuv420p";
		case "yuvj422p":
			return "yuv422p";
		case "yuvj444p":
			return "yuv444p";
		}
		return format;
	}

	enumerate(path : string) : Array<string> {
		const files = [];
		const entries = FS.readdirSync(path, {withFileTypes: true});
		for (const entry of entries) {
			if (entry.isDirectory()) {
				files.push(...this.enumerate(PATH.join(path, entry.name)));
			} else {
				files.push(PATH.join(path, entry.name));
			}
		}
		return files;
	}

	async compare(path : string) {
		if (!this._args.quiet) console.log(`'${path}' Comparing...`);

		const cmp = this.FFprobe([path]);
		if (cmp.video.length == 0) {
			console.error(`'${path}' Missing video track.`);
			return;
		}
		const fref = this._args.flip ? cmp : this._ref;

		let log = this._args.output;
		log = log.replaceAll("${path}", PATH.dirname(path));
		log = log.replaceAll("${file}", PATH.basename(path, PATH.extname(path)));
		log = log.replaceAll("${ext}", PATH.extname(path));

		const filters = [];
		{ // Adjust reference to the expected format.
			const chain = [];

			// Fix up initial Presentation Timestamp so it starts at 0.
			chain.push("setpts=PTS-STARTPTS");

			// Convert to the correct framerate.
			if (this._args.fps || (this._ref.video[0].r_framerate !== fref.video[0].r_framerate)) {
				chain.push(`fps=${valueOrDefault(this._args.fps, fref.video[0].r_framerate)}`);
			}

			// Convert format and color.
			if (this._args.color_space
				|| this._args.color_primaries
				|| this._args.color_trc
				|| this._args.color_range
				|| (this._ref.video[0].pix_fmt !== fref.video[0].pix_fmt)
				|| (this._ref.video[0].color_space !== fref.video[0].color_space)
				|| (this._ref.video[0].color_primaries !== fref.video[0].color_primaries)
				|| (this._ref.video[0].color_transfer !== fref.video[0].color_transfer)
				|| (this._ref.video[0].color_range !== fref.video[0].color_range)) {
				chain.push("colorspace=dither=fsb" +
					`:ispace=${valueOrDefault(this._ref.video[0].color_space, "bt709")}` +
					`:iprimaries=${valueOrDefault(this._ref.video[0].color_primaries, "bt709")}` +
					`:itrc=${valueOrDefault(this._ref.video[0].color_transfer, "bt709")}` +
					`:irange=${valueOrDefault(this._ref.video[0].color_range, "tv")}` +
					`:space=${valueOrDefault(this._args.color_space, valueOrDefault(fref.video[0].color_space, "bt709"))}` +
					`:primaries=${valueOrDefault(this._args.color_primaries, valueOrDefault(fref.video[0].color_primaries, "bt709"))}` +
					`:trc=${valueOrDefault(this._args.color_trc, valueOrDefault(fref.video[0].color_transfer, "bt709"))}` +
					`:range=${valueOrDefault(this._args.color_range, valueOrDefault(fref.video[0].color_range, "tv"))}` +
					`:format=${valueOrDefault(this._args.format, valueOrDefault(fref.video[0].pix_fmt, "yuv420p"))}`);
			}

			// Scale
			if (this._args.width
				|| this._args.height) {
				chain.push(
					`scale=w=${valueOrDefault(this._args.width, -1)}`+
					`:h=${valueOrDefault(this._args.height, -1)}`+
					":flags=bicubic+full_chroma_inp+full_chroma_int"+
					":force_original_aspect_ratio=0"
				);
			} else if ((this._ref.video[0].width !== fref.video[0].width)
				|| (this._ref.video[0].height !== fref.video[0].height)) {
				chain.push(
					`scale=w=${valueOrDefault(fref.video[0].width, this._ref.video[0].width)}`+
					`:h=${valueOrDefault(fref.video[0].height, this._ref.video[0].height)}`+
					":flags=bicubic+full_chroma_inp+full_chroma_int"+
					":force_original_aspect_ratio=0"
				);
			}

			filters.push(`[0:v:0]${chain.join(",")}[ref]`);
		}
		{ // Adjust distorted to the expected format.
			const chain = [];

			// Fix up initial Presentation Timestamp so it starts at 0.
			chain.push("setpts=PTS-STARTPTS");

			// Convert to the correct framerate.
			if (this._args.fps || (cmp.video[0].r_framerate !== fref.video[0].r_framerate)) {
				chain.push(`fps=${valueOrDefault(this._args.fps, fref.video[0].r_framerate)}`);
			}

			// Convert format and color.
			if (this._args.color_space
				|| this._args.color_primaries
				|| this._args.color_trc
				|| this._args.color_range
				|| (cmp.video[0].pix_fmt !== fref.video[0].pix_fmt)
				|| (cmp.video[0].color_space !== fref.video[0].color_space)
				|| (cmp.video[0].color_primaries !== fref.video[0].color_primaries)
				|| (cmp.video[0].color_transfer !== fref.video[0].color_transfer)
				|| (cmp.video[0].color_range !== fref.video[0].color_range)) {
				chain.push("colorspace=dither=fsb" +
					`:ispace=${valueOrDefault(cmp.video[0].color_space, "bt709")}` +
					`:iprimaries=${valueOrDefault(cmp.video[0].color_primaries, "bt709")}` +
					`:itrc=${valueOrDefault(cmp.video[0].color_transfer, "bt709")}` +
					`:irange=${valueOrDefault(cmp.video[0].color_range, "tv")}` +
					`:space=${valueOrDefault(this._args.color_space, valueOrDefault(fref.video[0].color_space, "bt709"))}` +
					`:primaries=${valueOrDefault(this._args.color_primaries, valueOrDefault(fref.video[0].color_primaries, "bt709"))}` +
					`:trc=${valueOrDefault(this._args.color_trc, valueOrDefault(fref.video[0].color_transfer, "bt709"))}` +
					`:range=${valueOrDefault(this._args.color_range, valueOrDefault(fref.video[0].color_range, "tv"))}` +
					`:format=${valueOrDefault(this._args.format, valueOrDefault(fref.video[0].pix_fmt, "yuv420p"))}`);
			}

			// Scale
			if (this._args.width
				|| this._args.height) {
				chain.push(
					`scale=w=${valueOrDefault(this._args.width, -1)}`+
					`:h=${valueOrDefault(this._args.height, -1)}`+
					":flags=bicubic+full_chroma_inp+full_chroma_int"+
					":force_original_aspect_ratio=0"
				);
			} else if ((cmp.video[0].width !== fref.video[0].width)
				|| (cmp.video[0].height !== fref.video[0].height)) {
				chain.push(
					`scale=w=${valueOrDefault(fref.video[0].width, cmp.video[0].width)}`+
					`:h=${valueOrDefault(fref.video[0].height, cmp.video[0].height)}`+
					":flags=bicubic+full_chroma_inp+full_chroma_int"+
					":force_original_aspect_ratio=0"
				);
			}

			filters.push(`[1:v:0]${chain.join(",")}[dst]`);
		}

		if (this._args.vmaf) {
			throw new Error("VMAF mode currently not supported.");
		} else {
			const chain = [];
			chain.push(`log_path=${log.replace(/\\/g, "/").replace(/:/, "\\\\:")}`);
			chain.push(`log_fmt=${PATH.extname(log).substring(1)}`);
			if (Array.isArray(this._args.model) && this._args.model.length > 0) {
				chain.push(`model=${this._args.model.join("|").replace(/([\\"'`:]{1,1})/g, "\\\\$1")}`);
			}
			if (Array.isArray(this._args.feature) && this._args.feature.length > 0) {
				chain.push(`feature=${this._args.feature.join("|").replace(/([\\"'`:]{1,1})/g, "\\\\$1")}`);
			}
			chain.push(`n_threads=${this._args.threads}`);
			filters.push(`[ref][dst]libvmaf=${chain.join(":")}`);

			const proc = this.FFmpeg([
				"-hide_banner",
				"-v", "info",
				"-stats",
				"-hwaccel", "auto",

				"-threads", this._args.threads,
				"-strict", "strict",
				"-hwaccel_flags", "+allow_high_depth",
				"-i", this._args.reference,

				"-threads", this._args.threads,
				"-strict", "strict",
				"-hwaccel_flags", "+allow_high_depth",
				"-i", path,

				"-sws_flags", "bicubic+full_chroma_inp+full_chroma_int",
				"-threads", this._args.threads,

				"-filter_threads", this._args.threads,
				"-filter_complex_threads", this._args.threads,
				"-filter_complex", filters.join(";"),

				"-f", "null", OS.platform() === "win32" ? "NUL" : "/dev/null"
			]);
			await new Promise((resolve, reject) => {
				const sout : Array<string> = [];
				const serr : Array<string> = [];
				proc.addListener("exit", (code) => {
					resolve({
						code: code,
						stdout: sout,
						stderr: serr,
					});
				});
				proc.addListener("error", (code) => {
					reject({
						code: code,
						stdout: sout,
						stderr: serr,
					});
				});
				proc.addListener("spawn", () => {
					proc.stdout?.addListener("data", (chunk) => {
						sout.push(chunk);
						if (!this._args.quiet) {
							PROCESS.stdout.write(chunk);
						}
					});
					proc.stderr?.addListener("data", (chunk) => {
						serr.push(chunk);
						if (!this._args.quiet) {
							PROCESS.stderr.write(chunk);
						}
					});
				});
			});
		}
	}

	public async run() : Promise<number> {
		this._args = this._argparse.parse_known_args();
		this.license();
		this._args = this._argparse.parse_args();

		//if (!this._args.quiet) console.dir(this._args);

		// Probe information (color, fps, ...) about the reference file.
		try {
			if (!this._args.quiet) console.log(`Loading reference file '${this._args.reference}'...`);
			this._ref = this.FFprobe([this._args.reference]);
			if (this._ref.video.length === 0) {
				throw new Error("Reference file contains no video tracks.");
			}
		} catch {
			throw new Error(`Failed to read reference file '${this._args.reference}'.`);
		}

		// Enumerate all files to compare.
		const files = [];
		for (const entry of this._args.distorted) {
			const stat = FS.statSync(entry);
			if (stat.isDirectory()) {
				files.push(...this.enumerate(entry));
			} else {
				files.push(entry);
			}
		}

		// Run comparison for each individual file.
		for (const file of files) {
			await this.compare(file);
		}

		return 0;
	}
}

(new App()).run().then((res) => {
	PROCESS.exit(res);
}, (err) => {
	console.error(err);
	PROCESS.exit(1);
});
