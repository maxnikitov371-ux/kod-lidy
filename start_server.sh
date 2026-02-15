set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting local server on http://localhost:8000/"
python3 -m http.server 8000
