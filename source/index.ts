// Copyright 2022 Michael Fabian 'Xaymar' Dirks <info@xaymar.com>\n\
// Copyright 2026 Narta Xaymar Dirks <info@xaymar.com>

/** A simple, but effective tool to quickly compare files with VMAF.
 *
 */

import { ArgumentParser } from "argparse";
import OS from "node:os";
import CHILD_PROCESS from "node:child_process";
import PROCESS from "node:process";
import PATH from "node:path";
import FS from "node:fs";
import PERCENTILE from "percentile";

function valueOrDefault(value : any, fallback : any) : any {
	if (value === undefined) {
		return fallback;
	} else {
		return value;
	}
}

interface FFProbeVideoStream {
	width: number;
	height: number;
	r_frame_rate: number;
	pix_fmt: string;
	color_space: string;
	color_primaries: string;
	color_transfer: string;
	color_range: string;
}

interface FFProbeResult {
	video: Array<FFProbeVideoStream>;
	audio: Array<unknown>;
	subtitle: Array<unknown>;
	code: number;
	stdout: Array<string>;
	stderr: Array<string>;
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

		this._argparse.add_argument("-v", "--verbose", {
			action: "store_true",
			help: "Be verbose."
		});

		this._argparse.add_argument("-q", "--quiet", {
			action: "store_true",
			help: "Be quiet."
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

		// this._argparse.add_argument("--flip", {
		// 	action: "store_true",
		// 	default: false,
		// 	help: "Scale, convert and resample to distorted file instead of reference file."
		// });

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

		this._argparse.add_argument("-f", "--format", {
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

		this._argparse.add_argument("--fps", {
			type: "str",
			help: "Define the FPS for comparison."
		});

		this._argparse.add_argument("--feature", {
			type: "str",
			action: "append",
			default: [],
			help: "Enable (and configure) a feature. See https://github.com/Netflix/vmaf/blob/master/resource/doc/features.md for more information."
		});

		this._argparse.add_argument("--model", {
			type: "str",
			action: "append",
			default: [],
			help: "Enable (and configure) a model. See https://github.com/Netflix/vmaf/tree/master/model for available models."
		});

		this._argparse.add_argument("--threads", {
			type: "int",
			default: (OS.cpus().length / 2).toFixed(0),
			help: "Number of threads to use."
		});

		this._argparse.add_argument("-p", "--parallel", {
			type: "int",
			default: (OS.cpus().length / 2).toFixed(0),
			help: "Number of distorted videos to compare in parallel. Default is one per 2 virtual cores."
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
Copyright 2026 Narta Xaymar Dirks <info@xaymar.com>\n\
\n\
Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:\n\
1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.\n\
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.\n\
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.\n\
\n\
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n"
		);
	}

	FFprobe(_args : Array<string>) {
		const args = [
			"-v", "quiet",
			"-print_format", "json",
			"-show_format",
			"-show_streams",
			"-show_programs",
			"-show_chapters",
			"-show_private_data",
			"-bitexact",
		].concat(_args);

		if (this._args.verbose === true) console.log([this._args.ffprobe].concat(args).join(" "));
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

	async FFprobe_new(_args: Array<string>) : Promise<FFProbeResult> {
		return new Promise((resolve, reject) => {
			const sout : Array<string> = [];
			const serr : Array<string> = [];
			const args = [
				"-v", "quiet",
				"-print_format", "json",
				"-show_format",
				"-show_streams",
				"-show_programs",
				"-show_chapters",
				"-show_private_data",
				"-bitexact",
			].concat(_args);

			if (this._args.verbose === true) console.log([this._args.ffprobe].concat(args).join(" "));
			const proc = CHILD_PROCESS.execFile(
				this._args.ffprobe,
				args,
				{ maxBuffer: 1073741824 }
			);
			proc.addListener("exit", (code : number) => {
				const res = JSON.parse(sout.join(""));
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

				resolve({
					code: code,
					stdout: sout,
					stderr: serr,
					video: res.video,
					audio: res.audio,
					subtitle: res.subtitle
				});
			});
			proc.addListener("error", (code : number) => {
				reject({
					code: code,
					stdout: sout,
					stderr: serr,
				});
			});
			proc.addListener("spawn", () => {
				proc.stdout?.addListener("data", (chunk : string) => {
					sout.push(chunk);
					if (this._args.verbose === true) {
						PROCESS.stdout.write(chunk);
					}
				});
				proc.stderr?.addListener("data", (chunk : string) => {
					serr.push(chunk);
					if (this._args.verbose === true) {
						PROCESS.stderr.write(chunk);
					}
				});
			});
		});
	}

	FFmpeg(args : Array<string>) {
		if (this._args.verbose === true) console.log([this._args.ffmpeg].concat(args).join(" "));
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
		if (this._args.quiet !== true) console.log(`Comparing '${path}'...`);

		let cmp;
		try {
			cmp = this.FFprobe([path]);
		} catch {
			console.error("Not a video file.");
			return;
		}
		if (cmp.video.length == 0) {
			console.error(`'${path}' Missing video track.`);
			return;
		}

		let log = this._args.output;
		log = log.replaceAll("${path}", PATH.dirname(path));
		log = log.replaceAll("${file}", PATH.basename(path, PATH.extname(path)));
		log = log.replaceAll("${ext}", PATH.extname(path));

		const filters = [];

		{ // Adjust reference to the expected format.
			const chain = [];

			// Fix up initial Presentation Timestamp so it starts at 0.
			chain.push("setpts=PTS-STARTPTS");

			// libplacebo: Framerate, Format, Color, Scale.
			const placebo = [];

			// Convert to the correct framerate.
			if (this._args.fps || (this._ref.video[0].r_frame_rate !== this._ref.video[0].r_frame_rate)) {
				placebo.push(`fps=${valueOrDefault(this._args.fps, this._ref.video[0].r_frame_rate)}`);
			}

			// Scale to the correct size.
			if ((this._ref.video[0].width !== this._ref.video[0].width) || (this._ref.video[0].height !== this._ref.video[0].height)) {
				placebo.push(`w=${valueOrDefault(this._args.width, this._ref.video[0].width)}`);
				placebo.push(`h=${valueOrDefault(this._args.height, this._ref.video[0].height)}`);
				placebo.push("force_original_aspect_ratio=true");
			} else if (this._args.width || this._args.height) {
				placebo.push(`w=${valueOrDefault(this._args.width, -1)}`);
				placebo.push(`h=${valueOrDefault(this._args.height, -1)}`);
				placebo.push("force_original_aspect_ratio=true");
			}

			// Convert format.
			if (this._args.format || (this._ref.video[0].pix_fmt !== this._ref.video[0].pix_fmt)) {
				placebo.push(`format=${valueOrDefault(this._args.format, valueOrDefault(this._ref.video[0].pix_fmt, "yuv420p"))}`);
			}

			// Convert color.
			if (this._args.color_space
				|| this._args.color_primaries
				|| this._args.color_trc
				|| this._args.color_range
				|| (this._ref.video[0].color_space !== this._ref.video[0].color_space)
				|| (this._ref.video[0].color_primaries !== this._ref.video[0].color_primaries)
				|| (this._ref.video[0].color_transfer !== this._ref.video[0].color_transfer)
				|| (this._ref.video[0].color_range !== this._ref.video[0].color_range)) {
				placebo.push(`colorspace=${valueOrDefault(this._args.color_space, valueOrDefault(this._ref.video[0].color_space, "auto"))}`);
				placebo.push(`range=${valueOrDefault(this._args.color_range, valueOrDefault(this._ref.video[0].color_range, "auto"))}`);
				placebo.push(`color_primaries=${valueOrDefault(this._args.color_primaries, valueOrDefault(this._ref.video[0].color_primaries, "auto"))}`);
				placebo.push(`color_trc=${valueOrDefault(this._args.color_trc, valueOrDefault(this._ref.video[0].color_transfer, "auto"))}`);
			}

			if (placebo.length > 0) {
				placebo.push("dithering=white");
				chain.push(`libplacebo=${placebo.join(":")}`);
			}

			filters.push(`[0:v:0]${chain.join(",")}[ref]`);
		}
		{ // Adjust distorted to the expected format.
			const chain = [];

			// Fix up initial Presentation Timestamp so it starts at 0.
			chain.push("setpts=PTS-STARTPTS");

			// libplacebo: Framerate, Format, Color, Scale.
			const placebo = [];

			// Convert to the correct framerate.
			if (this._args.fps || (cmp.video[0].r_frame_rate !== this._ref.video[0].r_frame_rate)) {
				placebo.push(`fps=${valueOrDefault(this._args.fps, this._ref.video[0].r_frame_rate)}`);
			}

			// Scale
			if ((cmp.video[0].width !== this._ref.video[0].width) || (cmp.video[0].height !== this._ref.video[0].height)) {
				placebo.push(`w=${valueOrDefault(this._ref.video[0].width, cmp.video[0].width)}`);
				placebo.push(`h=${valueOrDefault(this._ref.video[0].height, cmp.video[0].height)}`);
				placebo.push("force_original_aspect_ratio=true");
			} else if (this._args.width || this._args.height) {
				placebo.push(`w=${valueOrDefault(this._args.width, -1)}`);
				placebo.push(`h=${valueOrDefault(this._args.height, -1)}`);
				placebo.push("force_original_aspect_ratio=true");
			}

			// Convert format and color.
			if (this._args.color_space
				|| this._args.color_primaries
				|| this._args.color_trc
				|| this._args.color_range
				|| (cmp.video[0].color_space !== this._ref.video[0].color_space)
				|| (cmp.video[0].color_primaries !== this._ref.video[0].color_primaries)
				|| (cmp.video[0].color_transfer !== this._ref.video[0].color_transfer)
				|| (cmp.video[0].color_range !== this._ref.video[0].color_range)) {
				placebo.push(`colorspace=${valueOrDefault(this._args.color_space, valueOrDefault(this._ref.video[0].color_space, "auto"))}`);
				placebo.push(`range=${valueOrDefault(this._args.color_range, valueOrDefault(this._ref.video[0].color_range, "auto"))}`);
				placebo.push(`color_primaries=${valueOrDefault(this._args.color_primaries, valueOrDefault(this._ref.video[0].color_primaries, "auto"))}`);
				placebo.push(`color_trc=${valueOrDefault(this._args.color_trc, valueOrDefault(this._ref.video[0].color_transfer, "auto"))}`);
			}

			// Convert format.
			if (this._args.format || (cmp.video[0].pix_fmt !== this._ref.video[0].pix_fmt)) {
				placebo.push(`format=${valueOrDefault(this._args.format, valueOrDefault(this._ref.video[0].pix_fmt, "yuv420p"))}`);
			}

			if (placebo.length > 0) {
				placebo.push("dithering=white");
				chain.push(`libplacebo=${placebo.join(":")}`);
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
			chain.push("shortest=true");
			chain.push("eof_action=endall");
			filters.push(`[dst][ref]libvmaf=${chain.join(":")}`);

			const proc = this.FFmpeg([
				"-hide_banner",
				"-v", "quiet",
				"-stats",

				"-threads", this._args.threads,
				"-strict", "strict",
				"-hwaccel", "auto",
				"-hwaccel_flags", "+allow_high_depth",
				"-r", this._ref.video[0].r_frame_rate,
				"-i", this._args.reference,

				"-threads", this._args.threads,
				"-strict", "strict",
				"-hwaccel", "auto",
				"-hwaccel_flags", "+allow_high_depth",
				"-r", cmp.video[0].r_frame_rate,
				"-i", path,

				"-sws_flags", "bicubic+full_chroma_inp+full_chroma_int",
				"-threads", this._args.threads,

				"-filter_threads", this._args.threads,
				"-filter_complex_threads", this._args.threads,
				"-filter_complex", filters.join(";"),

				"-f", "null", OS.platform() === "win32" ? "NUL" : "/dev/null"
			]);
			const result : any = await new Promise((resolve, reject) => {
				const sout : Array<string> = [];
				const serr : Array<string> = [];
				proc.addListener("exit", (code : number) => {
					resolve({
						code: code,
						stdout: sout,
						stderr: serr,
					});
				});
				proc.addListener("error", (code : number) => {
					reject({
						code: code,
						stdout: sout,
						stderr: serr,
					});
				});
				proc.addListener("spawn", () => {
					proc.stdout?.addListener("data", (chunk : string) => {
						sout.push(chunk);
						if (this._args.quiet !== true) {
							PROCESS.stdout.write(chunk);
						}
					});
					proc.stderr?.addListener("data", (chunk : string) => {
						serr.push(chunk);
						if (this._args.quiet !== true) {
							PROCESS.stderr.write(chunk);
						}
					});
				});
			});
			if (result.code !== 0) {
				throw new Error("Unexpected failure running FFmpeg");
			}
		}

		if (PATH.extname(log) === ".json") {
			// Post-process the JSON file so we get more useful metrics.
			const data = JSON.parse(FS.readFileSync(log).toString("utf-8"));

			const prc = [50, 75, 90, 99, 99.9];

			const frames : any = {};
			for (const metric in data.pooled_metrics) {
				frames[metric] = [];
			}

			for (const frame of data.frames) {
				for (const metric in frame.metrics) {
					frames[metric].push(frame.metrics[metric]);
				}
			}

			for (const metric in data.pooled_metrics) {
				for (const p in prc) {
					data.pooled_metrics[metric][`${prc[p]}th %ile`] = PERCENTILE(
						100 - prc[p],
						frames[metric]
					);
				}
			}

			FS.writeFileSync(log, JSON.stringify(data, undefined, "\t"));
		}
	}

	async compare_many(paths : Array<string>) {
		while (paths.length > 0) {
			// Take out N files (depends on CPU or user setting).
			const num_files = Math.min(paths.length, this._args.parallel);
			const files = paths.slice(0, num_files - 1);
			paths = paths.slice(num_files);

			// Gather information for all files in parallel.
			if (this._args.quiet !== true) console.log(`Gathering info on files '${files.join("' '")}'...`);
			const probes = [];
			const logs = [];
			for (const file of files) {
				probes.push(this.FFprobe_new([file]));
				let log = this._args.output;
				log = log.replaceAll("${path}", PATH.dirname(file));
				log = log.replaceAll("${file}", PATH.basename(file, PATH.extname(file)));
				log = log.replaceAll("${ext}", PATH.extname(file));
				logs.push(log);
			}
			const metas : Array<FFProbeResult> = await Promise.all(probes);

			// Build filter chains for each input file.
			const filters = [];
			{ // Build the filter chain for the reference file.
				const chain = [];

				// Fix up initial Presentation Timestamp so it starts at 0.
				chain.push("setpts=PTS-STARTPTS");

				// libplacebo: Framerate, Format, Color, Scale.
				const placebo = [];

				// Convert to the correct framerate.
				if (this._args.fps || (this._ref.video[0].r_frame_rate !== this._ref.video[0].r_frame_rate)) {
					placebo.push(`fps=${valueOrDefault(this._args.fps, this._ref.video[0].r_frame_rate)}`);
				}

				// Scale to the correct size.
				if ((this._ref.video[0].width !== this._ref.video[0].width) || (this._ref.video[0].height !== this._ref.video[0].height)) {
					placebo.push(`w=${valueOrDefault(this._args.width, this._ref.video[0].width)}`);
					placebo.push(`h=${valueOrDefault(this._args.height, this._ref.video[0].height)}`);
					placebo.push("force_original_aspect_ratio=true");
				} else if (this._args.width || this._args.height) {
					placebo.push(`w=${valueOrDefault(this._args.width, -1)}`);
					placebo.push(`h=${valueOrDefault(this._args.height, -1)}`);
					placebo.push("force_original_aspect_ratio=true");
				}

				// Convert format.
				if (this._args.format || (this._ref.video[0].pix_fmt !== this._ref.video[0].pix_fmt)) {
					placebo.push(`format=${valueOrDefault(this._args.format, valueOrDefault(this._ref.video[0].pix_fmt, "yuv420p"))}`);
				}

				// Convert color.
				if (this._args.color_space
					|| this._args.color_primaries
					|| this._args.color_trc
					|| this._args.color_range
					|| (this._ref.video[0].color_space !== this._ref.video[0].color_space)
					|| (this._ref.video[0].color_primaries !== this._ref.video[0].color_primaries)
					|| (this._ref.video[0].color_transfer !== this._ref.video[0].color_transfer)
					|| (this._ref.video[0].color_range !== this._ref.video[0].color_range)) {
					placebo.push(`colorspace=${valueOrDefault(this._args.color_space, valueOrDefault(this._ref.video[0].color_space, "auto"))}`);
					placebo.push(`range=${valueOrDefault(this._args.color_range, valueOrDefault(this._ref.video[0].color_range, "auto"))}`);
					placebo.push(`color_primaries=${valueOrDefault(this._args.color_primaries, valueOrDefault(this._ref.video[0].color_primaries, "auto"))}`);
					placebo.push(`color_trc=${valueOrDefault(this._args.color_trc, valueOrDefault(this._ref.video[0].color_transfer, "auto"))}`);
				}

				if (placebo.length > 0) {
					placebo.push("dithering=white");
					chain.push(`libplacebo=${placebo.join(":")}`);
				}

				const names = [];
				for (let idx = 1; idx <= files.length; idx++) {
					names.push(`[ref${idx}]`);
				}
				filters.push(`[0:v:0]${chain.join(",")},split=${files.length}${names.join("")}`);
			}

			for (let idx = 0; idx < files.length; idx++) { // Adjust distorted to the expected format.
				const file = files[idx];
				const meta : FFProbeResult = metas[idx];
				const chain = [];

				// Fix up initial Presentation Timestamp so it starts at 0.
				chain.push("setpts=PTS-STARTPTS");

				// libplacebo: Framerate, Format, Color, Scale.
				const placebo = [];

				// Convert to the correct framerate.
				if (this._args.fps || (meta.video[0].r_frame_rate !== this._ref.video[0].r_frame_rate)) {
					placebo.push(`fps=${valueOrDefault(this._args.fps, this._ref.video[0].r_frame_rate)}`);
				}

				// Scale
				if ((meta.video[0].width !== this._ref.video[0].width) || (meta.video[0].height !== this._ref.video[0].height)) {
					placebo.push(`w=${valueOrDefault(this._ref.video[0].width, meta.video[0].width)}`);
					placebo.push(`h=${valueOrDefault(this._ref.video[0].height, meta.video[0].height)}`);
					placebo.push("force_original_aspect_ratio=true");
				} else if (this._args.width || this._args.height) {
					placebo.push(`w=${valueOrDefault(this._args.width, -1)}`);
					placebo.push(`h=${valueOrDefault(this._args.height, -1)}`);
					placebo.push("force_original_aspect_ratio=true");
				}

				// Convert format and color.
				if (this._args.color_space
					|| this._args.color_primaries
					|| this._args.color_trc
					|| this._args.color_range
					|| (meta.video[0].color_space !== this._ref.video[0].color_space)
					|| (meta.video[0].color_primaries !== this._ref.video[0].color_primaries)
					|| (meta.video[0].color_transfer !== this._ref.video[0].color_transfer)
					|| (meta.video[0].color_range !== this._ref.video[0].color_range)) {
					placebo.push(`colorspace=${valueOrDefault(this._args.color_space, valueOrDefault(this._ref.video[0].color_space, "auto"))}`);
					placebo.push(`range=${valueOrDefault(this._args.color_range, valueOrDefault(this._ref.video[0].color_range, "auto"))}`);
					placebo.push(`color_primaries=${valueOrDefault(this._args.color_primaries, valueOrDefault(this._ref.video[0].color_primaries, "auto"))}`);
					placebo.push(`color_trc=${valueOrDefault(this._args.color_trc, valueOrDefault(this._ref.video[0].color_transfer, "auto"))}`);
				}

				// Convert format.
				if (this._args.format || (meta.video[0].pix_fmt !== this._ref.video[0].pix_fmt)) {
					placebo.push(`format=${valueOrDefault(this._args.format, valueOrDefault(this._ref.video[0].pix_fmt, "yuv420p"))}`);
				}

				if (placebo.length > 0) {
					placebo.push("dithering=white");
					chain.push(`libplacebo=${placebo.join(":")}`);
				}

				filters.push(`[${idx + 1}:v:0]${chain.join(",")}[dst${idx + 1}]`);
			}
			for (let idx = 0; idx < files.length; idx++) {
				const chain = [];
				chain.push(`log_path=${logs[idx].replace(/\\/g, "/").replace(/:/, "\\\\:")}`);
				chain.push(`log_fmt=${PATH.extname(logs[idx]).substring(1)}`);
				if (Array.isArray(this._args.model) && this._args.model.length > 0) {
					chain.push(`model=${this._args.model.join("|").replace(/([\\"'`:]{1,1})/g, "\\\\$1")}`);
				}
				if (Array.isArray(this._args.feature) && this._args.feature.length > 0) {
					chain.push(`feature=${this._args.feature.join("|").replace(/([\\"'`:]{1,1})/g, "\\\\$1")}`);
				}
				chain.push(`n_threads=${this._args.threads}`);
				chain.push("shortest=true");
				chain.push("eof_action=endall");
				filters.push(`[dst${idx+1}][ref${idx+1}]libvmaf=${chain.join(":")}`);
			}

			// Build the command line.
			const _args = [
				"-hide_banner",
				"-v", `${this._args.verbose === true ? "debug" : "warning"}`,
				"-stats",
				"-sws_flags", "bicubic+full_chroma_inp+full_chroma_int",
				"-threads", this._args.threads,
				"-filter_threads", this._args.threads,
				"-filter_complex_threads", this._args.threads,

				// Reference video.
				"-threads", this._args.threads,
				"-strict", "strict",
				"-hwaccel", "auto",
				"-hwaccel_flags", "+allow_high_depth",
				"-r", this._ref.video[0].r_frame_rate,
				"-i", this._args.reference,
			];
			for (let idx = 0; idx < files.length; idx++) {
				_args.push(...[
					"-threads", this._args.threads,
					"-strict", "strict",
					"-hwaccel", "auto",
					"-hwaccel_flags", "+allow_high_depth",
					"-r", metas[idx].video[0].r_frame_rate,
					"-i", files[idx],
				]);
			}
			_args.push(...[
				"-filter_complex", filters.join(";"),
				"-f", "null", OS.platform() === "win32" ? "NUL" : "/dev/null"
			]);

			// Run VMAF
			if (this._args.quiet !== true) console.log(`Comparing files '${files.join("' '")}' with '${this._args.reference}'...`);
			const result : any = await new Promise((resolve, reject) => {
				const proc = this.FFmpeg(_args);
				const sout : Array<string> = [];
				const serr : Array<string> = [];
				proc.addListener("exit", (code : number) => {
					resolve({
						code: code,
						stdout: sout,
						stderr: serr,
					});
				});
				proc.addListener("error", (code : number) => {
					reject({
						code: code,
						stdout: sout,
						stderr: serr,
					});
				});
				proc.addListener("spawn", () => {
					proc.stdout?.addListener("data", (chunk : string) => {
						sout.push(chunk);
						if (!this._args.quiet === true) {
							PROCESS.stdout.write(chunk);
						}
					});
					proc.stderr?.addListener("data", (chunk : string) => {
						serr.push(chunk);
						if (!this._args.quiet === true) {
							PROCESS.stderr.write(chunk);
						}
					});
				});
			});
			if (result.code !== 0) {
				//console.log(result.stderr.join(''));
				throw new Error("Unexpected failure running FFmpeg");
			}

			// Patch up json output with percentiles.
			for (const log of logs) {
				if (PATH.extname(log) === ".json") {
					// Post-process the JSON file so we get more useful metrics.
					const data = JSON.parse(FS.readFileSync(log).toString("utf-8"));

					const prc = [50, 75, 90, 99, 99.9];

					const frames : any = {};
					for (const metric in data.pooled_metrics) {
						frames[metric] = [];
					}

					for (const frame of data.frames) {
						for (const metric in frame.metrics) {
							frames[metric].push(frame.metrics[metric]);
						}
					}

					for (const metric in data.pooled_metrics) {
						for (const p in prc) {
							data.pooled_metrics[metric][`${prc[p]}th %ile`] = PERCENTILE(
								100 - prc[p],
								frames[metric]
							);
						}
					}

					FS.writeFileSync(log, JSON.stringify(data, undefined, "\t"));
				}
			}
		}
	}

	public async run() : Promise<number> {
		this._args = this._argparse.parse_args();
		this.license();

		//if (this._args.verbose === true) console.dir(this._args);

		// Probe information (color, fps, ...) about the reference file.
		try {
			if (this._args.quiet !== true) console.log(`Loading reference file '${this._args.reference}'...`);
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

		// Run comparison for each file.
		await this.compare_many(files);
		// for (const file of files) {
		// 	await this.compare(file);
		// }

		return 0;
	}
}

(new App()).run().then((res) => {
	PROCESS.exit(res);
}, (err) => {
	console.error(err);
	PROCESS.exit(1);
});
