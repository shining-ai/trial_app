import asyncio
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import PurePath

from app.lib.logger import log_error, log_info

_STDERR_TAIL_LINES = 50
_SLOW_SECONDS = 1.0


@dataclass(frozen=True)
class ProcessResult:
    returncode: int
    stderr_tail: list[str]


class ProcessFailedError(Exception):
    """子プロセスが0以外で終了した、または時間の上限を超えたときに送出する。"""

    def __init__(self, args: list[str], returncode: int | None, stderr_tail: list[str], timed_out: bool):
        reason = "時間の上限を超えました" if timed_out else f"終了コード {returncode}"
        super().__init__(f"{PurePath(args[0]).name} が失敗しました({reason})")
        self.args_list = args
        self.returncode = returncode
        self.stderr_tail = stderr_tail
        self.timed_out = timed_out


async def run_process(
    args: list[str],
    *,
    timeout_seconds: float,
    on_stdout_line: Callable[[str], None] | None = None,
) -> ProcessResult:
    """子プロセスを引数のリストで実行する(シェルを経由しない)。

    標準出力は1行ずつ on_stdout_line に渡し、標準エラー出力は末尾だけを保持する。
    失敗したときは引数・終了コード・標準エラー出力の末尾を記録して ProcessFailedError を送出する。
    """
    program = PurePath(args[0]).name
    started = time.monotonic()
    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stderr_tail: deque[str] = deque(maxlen=_STDERR_TAIL_LINES)

    async def read_stdout():
        # 1行の長さに上限を設けないよう、行単位ではなく塊で読んで自分で区切る
        pending = b""
        while chunk := await process.stdout.read(65536):
            pending += chunk
            *lines, pending = pending.split(b"\n")
            if on_stdout_line is not None:
                for raw in lines:
                    on_stdout_line(raw.decode(errors="replace"))
        if pending and on_stdout_line is not None:
            on_stdout_line(pending.decode(errors="replace"))

    async def read_stderr():
        pending = b""
        while chunk := await process.stderr.read(65536):
            pending += chunk
            *lines, pending = pending.split(b"\n")
            stderr_tail.extend(raw.decode(errors="replace") for raw in lines)
        if pending:
            stderr_tail.append(pending.decode(errors="replace"))

    timed_out = False
    try:
        await asyncio.wait_for(asyncio.gather(read_stdout(), read_stderr(), process.wait()), timeout_seconds)
    except TimeoutError:
        timed_out = True
        await _stop(process)
    except BaseException:
        # 取り消しやその他の例外でも、子プロセスを残さない
        await _stop(process)
        raise

    elapsed_ms = round((time.monotonic() - started) * 1000)
    if timed_out or process.returncode != 0:
        error = ProcessFailedError(args, process.returncode, list(stderr_tail), timed_out)
        log_error(
            "lib.run_process",
            f"{program} が失敗しました",
            err=error,
            program=program,
            args=args,
            returncode=process.returncode,
            timed_out=timed_out,
            stderr_tail=list(stderr_tail),
            ms=elapsed_ms,
        )
        raise error

    if program == "ffmpeg" or elapsed_ms > _SLOW_SECONDS * 1000:
        log_info("lib.run_process", f"{program} が成功しました", program=program, ms=elapsed_ms)
    return ProcessResult(returncode=process.returncode, stderr_tail=list(stderr_tail))


async def _stop(process: asyncio.subprocess.Process) -> None:
    if process.returncode is None:
        try:
            process.kill()
        except ProcessLookupError:
            pass
    await asyncio.shield(process.wait())
