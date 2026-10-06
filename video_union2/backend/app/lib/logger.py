import json
import logging
import sys
import traceback

from app.lib.request_context import current_request_id

_LOGGER_NAME = "video_union"
_logger = logging.getLogger(_LOGGER_NAME)


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {"level": record.levelname, "message": record.getMessage(), **getattr(record, "fields", {})}
        return json.dumps(entry, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """標準出力に JSON 1行でログを出すように設定する(何度呼んでも1回だけ設定する)。"""
    if any(isinstance(h.formatter, _JsonFormatter) for h in _logger.handlers):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    _logger.addHandler(handler)
    _logger.setLevel(logging.INFO)


def log_info(name: str, message: str, **fields) -> None:
    """標準キー(name、request_id)を付けて info を出す。"""
    _logger.info(message, extra={"fields": _standard_fields(name, fields)})


def log_error(name: str, message: str, *, err: BaseException | None = None, **fields) -> None:
    """標準キー(name、request_id、err)を付けて error を出す。"""
    if err is not None:
        fields["err"] = {
            "type": type(err).__name__,
            "message": str(err),
            "stack": "".join(traceback.format_exception(err)),
        }
    _logger.error(message, extra={"fields": _standard_fields(name, fields)})


def _standard_fields(name: str, fields: dict) -> dict:
    return {"name": name, "request_id": current_request_id(), **fields}
