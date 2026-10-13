from pydantic import ValidationError

from app.features.merge.schemas import MergeRequest
from app.lib.errors import AppError


def parse_merge_request(body: bytes) -> MergeRequest:
    """本文の JSON を MergeRequest にする。形が誤っていれば 422 の invalid_request を送出する。

    pydantic の ValidationError は入力値(テキストの本文)を含むため、連鎖させずに捨てる。
    """
    try:
        return MergeRequest.model_validate_json(body)
    except ValidationError:
        pass
    raise AppError(422, "invalid_request", "リクエストの形式が正しくありません")
