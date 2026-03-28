#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="${ROOT_DIR}/docker-compose.yml"
LLM_COMPOSE="${ROOT_DIR}/docker-compose.llm.yml"

DOCKER_ENV_KIND=""
DOCKER_ENV_LABEL=""
DOCKER_PACKAGE_MANAGER=""
DOCKER_PACKAGE_MANAGER_LABEL=""

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

docker_cli_available() {
  command_exists docker
}

docker_compose_available() {
  docker_cli_available && docker compose version >/dev/null 2>&1
}

docker_runtime_ready() {
  docker_cli_available && docker info >/dev/null 2>&1
}

detect_docker_environment() {
  local uname_s=""

  DOCKER_ENV_KIND="unknown"
  DOCKER_ENV_LABEL="Unknown"
  DOCKER_PACKAGE_MANAGER=""
  DOCKER_PACKAGE_MANAGER_LABEL="None detected"

  uname_s="$(uname -s 2>/dev/null || echo unknown)"

  case "${uname_s}" in
    Darwin)
      DOCKER_ENV_KIND="macos"
      DOCKER_ENV_LABEL="macOS"
      ;;
    Linux)
      DOCKER_ENV_KIND="linux"
      DOCKER_ENV_LABEL="Linux"
      if [[ -r /proc/sys/kernel/osrelease ]] && grep -qi microsoft /proc/sys/kernel/osrelease; then
        DOCKER_ENV_KIND="wsl"
        DOCKER_ENV_LABEL="WSL"
      elif [[ -r /proc/version ]] && grep -qi microsoft /proc/version; then
        DOCKER_ENV_KIND="wsl"
        DOCKER_ENV_LABEL="WSL"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      DOCKER_ENV_KIND="windows_shell"
      DOCKER_ENV_LABEL="Windows shell"
      ;;
  esac

  if [[ "${DOCKER_ENV_KIND}" == "macos" ]] && command_exists brew; then
    DOCKER_PACKAGE_MANAGER="brew"
    DOCKER_PACKAGE_MANAGER_LABEL="Homebrew"
  elif [[ "${DOCKER_ENV_KIND}" == "linux" ]] && command_exists apt-get; then
    DOCKER_PACKAGE_MANAGER="apt-get"
    DOCKER_PACKAGE_MANAGER_LABEL="apt-get"
  elif [[ "${DOCKER_ENV_KIND}" == "linux" ]] && command_exists dnf; then
    DOCKER_PACKAGE_MANAGER="dnf"
    DOCKER_PACKAGE_MANAGER_LABEL="dnf"
  elif [[ "${DOCKER_ENV_KIND}" == "linux" ]] && command_exists yum; then
    DOCKER_PACKAGE_MANAGER="yum"
    DOCKER_PACKAGE_MANAGER_LABEL="yum"
  elif [[ "${DOCKER_ENV_KIND}" == "linux" ]] && command_exists pacman; then
    DOCKER_PACKAGE_MANAGER="pacman"
    DOCKER_PACKAGE_MANAGER_LABEL="pacman"
  elif [[ "${DOCKER_ENV_KIND}" == "wsl" || "${DOCKER_ENV_KIND}" == "windows_shell" ]] && command_exists powershell.exe; then
    DOCKER_PACKAGE_MANAGER="winget"
    DOCKER_PACKAGE_MANAGER_LABEL="winget via PowerShell"
  fi
}

print_detected_environment() {
  echo "  Detected environment:"
  echo "  - OS: ${DOCKER_ENV_LABEL}"
  echo "  - Package manager: ${DOCKER_PACKAGE_MANAGER_LABEL}"
}

print_docker_install_guidance() {
  echo "  Docker installation guidance:"

  case "${DOCKER_ENV_KIND}" in
    macos)
      if [[ "${DOCKER_PACKAGE_MANAGER}" == "brew" ]]; then
        echo "  - Install Docker Desktop with Homebrew:"
        echo "      brew install --cask docker"
        echo "  - Then launch Docker Desktop once:"
        echo "      open -a Docker"
      else
        echo "  - Install Docker Desktop for macOS:"
        echo "      https://www.docker.com/products/docker-desktop/"
      fi
      ;;
    linux)
      echo "  - Install Docker Engine for your distro."
      case "${DOCKER_PACKAGE_MANAGER}" in
        apt-get)
          echo "      sudo apt-get update"
          echo "      sudo apt-get install -y docker.io docker-compose-v2"
          ;;
        dnf)
          echo "      sudo dnf install -y docker docker-compose-plugin"
          ;;
        yum)
          echo "      sudo yum install -y docker docker-compose-plugin"
          ;;
        pacman)
          echo "      sudo pacman -Sy docker docker-compose"
          ;;
        *)
          echo "      https://docs.docker.com/engine/install/"
          ;;
      esac
      echo "  - Start the Docker service after installation."
      ;;
    wsl)
      echo "  - Install Docker Desktop on Windows first."
      echo "      winget install -e --id Docker.DockerDesktop"
      echo "  - Then enable WSL integration in Docker Desktop settings."
      ;;
    windows_shell)
      echo "  - Install Docker Desktop for Windows:"
      echo "      winget install -e --id Docker.DockerDesktop"
      ;;
    *)
      echo "  - Install Docker Desktop or Docker Engine for your operating system:"
      echo "      https://docs.docker.com/get-started/get-docker/"
      ;;
  esac
}

print_docker_runtime_guidance() {
  local runtime_error="${1:-}"

  echo "  Docker runtime guidance:"

  case "${DOCKER_ENV_KIND}" in
    macos)
      echo "  - Open Docker Desktop and wait until it reports that Docker is running."
      echo "      open -a Docker"
      ;;
    linux)
      if [[ "${runtime_error}" == *"permission denied"* ]]; then
        echo "  - Docker is installed, but this shell cannot access the Docker socket."
        echo "      sudo usermod -aG docker ${USER:-your-user}"
        echo "      # Then open a new terminal session and run the script again."
      else
        echo "  - Start the Docker service:"
        echo "      sudo systemctl start docker"
      fi
      ;;
    wsl)
      echo "  - Start Docker Desktop on Windows and enable WSL integration for this distro."
      ;;
    windows_shell)
      echo "  - Start Docker Desktop and wait until the engine is running."
      ;;
    *)
      echo "  - Start your Docker engine, then run this script again."
      ;;
  esac
}

wait_for_docker_runtime() {
  local timeout_seconds="${1:-90}"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    if docker_runtime_ready; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  return 1
}

attempt_docker_install() {
  local compose_pkg=""

  case "${DOCKER_ENV_KIND}:${DOCKER_PACKAGE_MANAGER}" in
    macos:brew)
      echo "  Installing Docker Desktop with Homebrew..."
      brew install --cask docker
      if command_exists open; then
        echo "  Launching Docker Desktop..."
        open -a Docker >/dev/null 2>&1 || true
      fi
      return 0
      ;;
    linux:apt-get)
      if ! command_exists sudo; then
        echo "  Cannot auto-install Docker because 'sudo' is not available."
        return 1
      fi

      echo "  Installing Docker with apt-get..."
      sudo apt-get update

      if command_exists apt-cache; then
        if apt-cache show docker-compose-v2 >/dev/null 2>&1; then
          compose_pkg="docker-compose-v2"
        elif apt-cache show docker-compose-plugin >/dev/null 2>&1; then
          compose_pkg="docker-compose-plugin"
        fi
      fi

      if [[ -n "${compose_pkg}" ]]; then
        sudo apt-get install -y docker.io "${compose_pkg}"
      else
        sudo apt-get install -y docker.io
      fi
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

attempt_docker_runtime_start() {
  case "${DOCKER_ENV_KIND}" in
    macos)
      if command_exists open; then
        echo "  Starting Docker Desktop..."
        open -a Docker >/dev/null 2>&1 || true
        wait_for_docker_runtime 120
        return $?
      fi
      return 1
      ;;
    linux)
      if command_exists sudo && command_exists systemctl; then
        echo "  Starting the Docker service..."
        sudo systemctl start docker
        wait_for_docker_runtime 30
        return $?
      fi
      if command_exists sudo && command_exists service; then
        echo "  Starting the Docker service..."
        sudo service docker start
        wait_for_docker_runtime 30
        return $?
      fi
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

ensure_docker_prerequisites() {
  local runtime_error=""

  if [[ -t 0 ]]; then
    echo ""
    echo "  Preflight check:"
    echo "  SparkOrbit will automatically inspect Docker, Docker Compose,"
    echo "  and engine readiness before continuing."
  fi

  detect_docker_environment

  if ! docker_cli_available || ! docker_compose_available; then
    echo ""
    echo "  Docker is required to run SparkOrbit."
    if ! docker_cli_available; then
      echo "  - Docker CLI: missing"
      echo "  - Docker Compose v2: unavailable"
    else
      echo "  - Docker CLI: found"
      echo "  - Docker Compose v2: unavailable"
    fi
    print_detected_environment
    echo ""

    if [[ ! -t 0 ]]; then
      print_docker_install_guidance
      exit 1
    fi

    printf "\n\033[1;33m⚠️  Docker is not available. Try to install or configure it now? [Y/n] \033[0m"
    read -r docker_reply
    case "${docker_reply}" in
      n|N|no|NO)
        echo ""
        echo "  Docker is required, so SparkOrbit cannot continue without it."
        exit 1
        ;;
    esac

    echo ""
    if ! attempt_docker_install; then
      echo "  Automatic installation is not available for this environment."
      print_docker_install_guidance
      exit 1
    fi

    detect_docker_environment
    if ! docker_cli_available || ! docker_compose_available; then
      echo "  Docker installation did not complete cleanly."
      print_docker_install_guidance
      exit 1
    fi

    echo "  ✓ Docker CLI and Compose are installed."
  fi

  if ! docker_runtime_ready; then
    runtime_error="$(docker info 2>&1 >/dev/null || true)"
    runtime_error="${runtime_error%%$'\n'*}"

    echo ""
    echo "  Docker is installed, but the engine is not ready yet."
    if [[ -n "${runtime_error}" ]]; then
      echo "  - ${runtime_error}"
    fi
    print_detected_environment
    echo ""

    if [[ ! -t 0 ]]; then
      print_docker_runtime_guidance "${runtime_error}"
      exit 1
    fi

    printf "\n\033[1;33m⚠️  Docker is installed but not running. Try to start it now? [Y/n] \033[0m"
    read -r start_reply
    case "${start_reply}" in
      n|N|no|NO)
        echo ""
        echo "  Docker must be running before SparkOrbit can start."
        exit 1
        ;;
    esac

    echo ""
    if ! attempt_docker_runtime_start; then
      echo "  Docker could not be started automatically."
      print_docker_runtime_guidance "${runtime_error}"
      exit 1
    fi

    echo "  ✓ Docker engine is running."
  fi
}

MODE_FILE="${ROOT_DIR}/.sparkorbit-mode"
USE_LLM=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-llm)    USE_LLM="yes"; shift ;;
    --without-llm) USE_LLM="no";  shift ;;
    *)             EXTRA_ARGS+=("$1"); shift ;;
  esac
done

ensure_docker_prerequisites

if [[ -z "${USE_LLM}" ]]; then
  if [[ -f "${MODE_FILE}" ]]; then
    saved="$(cat "${MODE_FILE}")"
    case "${saved}" in
      yes|no) USE_LLM="${saved}" ;;
    esac
    if [[ -n "${USE_LLM}" ]]; then
      if [[ "${USE_LLM}" == "yes" ]]; then
        echo "  Using saved mode: LLM ON (from previous session)"
      else
        echo "  Using saved mode: LLM OFF (from previous session)"
      fi
    fi
  fi
fi

if [[ -z "${USE_LLM}" ]]; then
  if [[ -t 0 ]]; then
    echo ""
    echo "  Local LLM bundle is recommended and enabled by default."
    echo "  It adds company filter, paper classifier, and daily briefing."
    echo "  Requires: NVIDIA GPU with ~4GB VRAM (6-8GB recommended for full context)"
    echo "  Model: qwen3.5:4b (~3.4GB download)"
    echo ""
    while true; do
      printf "\033[1;33m⚠️  Use local LLM bundle? [Y/n] \033[0m"
      read -r reply
      case "${reply}" in
        y|Y|yes|YES|"") USE_LLM="yes"; break ;;
        n|N|no|NO)      USE_LLM="no";  break ;;
        *)
          echo "  Please enter Y or N."
          ;;
      esac
    done
  else
    USE_LLM="yes"
  fi
fi

echo "${USE_LLM}" > "${MODE_FILE}"

compose_args=(-f "${BASE_COMPOSE}")
if [[ "${USE_LLM}" == "yes" ]]; then
  compose_args+=(-f "${LLM_COMPOSE}")
fi

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║                                                      ║"
echo "  ║   SparkOrbit — AI World Monitor                      ║"
echo "  ║                                                      ║"
echo "  ║   Open your browser now:                             ║"
echo "  ║   → http://localhost:3000                            ║"
echo "  ║                                                      ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""
echo "  What happens next:"
echo ""
echo "  1. Building containers      — First run may take 1-2 minutes."
echo "  2. Starting services        — Frontend, Backend, Redis."
if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  3. Downloading LLM model   — qwen3.5:4b (~3.4GB), runs in background."
fi
echo "  4. Collecting source data   — Papers, models, news from 40+ sources."
if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  5. LLM enrichment          — Summarization, paper filtering, briefing."
  echo "                               This runs automatically once the model is ready."
fi
echo ""
echo "  You can open http://localhost:3000 right away."
echo "  The loading screen shows real-time progress as each step completes."
echo ""
if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  [LLM: ON]  AI summary, paper topics, and daily briefing enabled."
else
  echo "  [LLM: OFF] Source curation only. No AI summarization."
  echo "              To enable LLM later: bash scripts/docker-up.sh --with-llm"
fi
echo ""
echo "  Building and starting containers..."
echo ""

docker_cmd=(docker compose "${compose_args[@]}" up --build -d --remove-orphans)
if (( ${#EXTRA_ARGS[@]} > 0 )); then
  docker_cmd+=("${EXTRA_ARGS[@]}")
fi

"${docker_cmd[@]}"

echo ""
echo "  ✓ All containers started successfully."
echo ""
echo "  → http://localhost:3000"
echo ""
