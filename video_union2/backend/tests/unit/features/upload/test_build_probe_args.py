from pathlib import Path

from app.features.upload.build_probe_args import build_probe_args
from app.lib.media_input_policy import ALLOWED_FORMATS


def test_probe_args_restrict_protocols_and_formats():
    args = build_probe_args(Path("/data/uploads/x.bin"))

    assert args[0] == "ffprobe"
    assert args[args.index("-protocol_whitelist") + 1] == "file"
    assert args[args.index("-format_whitelist") + 1] == ",".join(ALLOWED_FORMATS)
    assert "-show_format" in args and "-show_streams" in args


def test_path_comes_after_double_dash_so_it_is_never_an_option():
    args = build_probe_args(Path("-evil.bin"))

    assert args[-2:] == ["--", "-evil.bin"]

