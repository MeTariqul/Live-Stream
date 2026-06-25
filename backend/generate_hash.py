import sys
import bcrypt


def main() -> None:
    if len(sys.argv) < 2:
        print('Usage: python generate_hash.py <password>')
        sys.exit(1)

    password = sys.argv[1]
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    print(f'ADMIN_PASS_HASH={hashed}')


if __name__ == '__main__':
    main()
