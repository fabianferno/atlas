LLAMA_SERVER=/Users/fabianferno/Models/Local/repos/llama.cpp/build/bin/llama-server

$LLAMA_SERVER \
  -m models/unsloth-Qwen3.6-35B-A3B-MTP-GGUF/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf \
  --mmproj models/unsloth-Qwen3.6-35B-A3B-MTP-GGUF/mmproj-BF16.gguf \
  --spec-type draft-mtp \
  --spec-draft-n-max 3 \
  -ngl 999 \
  -fa on \
  -c 65536 \
  --parallel 1 \
  --host 127.0.0.1 \
  --port 8081

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_NAME="${SESSION_NAME:-qwen-server}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"
CTX_SIZE="${CTX_SIZE:-65536}"
PARALLEL="${PARALLEL:-1}"

LLAMA_SERVER="$ROOT_DIR/repos/llama.cpp/build/bin/llama-server"
MODEL="$ROOT_DIR/models/unsloth-Qwen3.6-35B-A3B-MTP-GGUF/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf"
MMPROJ="$ROOT_DIR/models/unsloth-Qwen3.6-35B-A3B-MTP-GGUF/mmproj-BF16.gguf"
LOG_FILE="$ROOT_DIR/logs/llama-server-qwen.log"

mkdir -p "$ROOT_DIR/logs"

tmux new-session -d -s "$SESSION_NAME" -c "$ROOT_DIR" \
  "$LLAMA_SERVER \
    -m '$MODEL' \
    --mmproj '$MMPROJ' \
    --spec-type draft-mtp \
    --spec-draft-n-max 3 \
    -ngl 999 \
    -fa on \
    -c '$CTX_SIZE' \
    --parallel '$PARALLEL' \
    --host '$HOST' \
    --port '$PORT' \
    2>&1 | tee -a '$LOG_FILE'"
 fabianferno@PhantomCore  ~/Models/Local 