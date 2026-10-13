from pathlib import Path

from app.features.merge.build_concat_args import build_concat_args


def test_concat_args_restrict_protocol_copy_streams_and_write_partial_result():
    args = build_concat_args(Path("/data/merges/j/parts.txt"), Path("/data/merges/j/result.partial.mp4"))

    i = args.index("-i")
    assert args[i + 1] == "/data/merges/j/parts.txt"
    assert args[args.index("-protocol_whitelist") + 1] == "file"
    assert args.index("-protocol_whitelist") < i
    assert args[args.index("-f") + 1] == "concat"
    assert args[args.index("-safe") + 1] == "0"
    assert args[args.index("-c") + 1] == "copy"
    assert args[args.index("-movflags") + 1] == "+faststart"
    assert args[-1] == "/data/merges/j/result.partial.mp4"
