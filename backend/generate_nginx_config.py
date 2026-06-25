import sys
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

from config import settings


def main() -> None:
    template_dir = Path(__file__).parent
    env = Environment(loader=FileSystemLoader(str(template_dir)))
    template = env.get_template('nginx.conf.j2')

    output = template.render(
        rtmp_port=settings.RTMP_PORT,
        http_port=settings.HTTP_PORT,
        hls_path=str(Path(settings.HLS_PATH).resolve()),
        stream_key=settings.STREAM_KEY,
        internal_base_url=f'http://127.0.0.1:{settings.HTTP_PORT}'
    )

    print(output)


if __name__ == '__main__':
    main()
