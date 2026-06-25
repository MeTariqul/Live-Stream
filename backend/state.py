from connection_manager import ConnectionManager

manager = ConnectionManager()
is_live = False


def set_live(value: bool) -> None:
    global is_live
    is_live = value


def get_live() -> bool:
    return is_live
