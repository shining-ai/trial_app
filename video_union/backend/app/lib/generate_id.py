import uuid


def generate_id() -> str:
    """推測されにくい32桁の16進数の ID を作る。"""
    return uuid.uuid4().hex
