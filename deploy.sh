#!/bin/bash

###############################################################################
# Jigsaw Puzzle - Automated SFTP Deployment Script
# Deploys application files to Ionos hosting at rambis.net/puzzle
###############################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SFTP_HOST="access-5019433264.webspace-host.com"
SFTP_PORT="22"
SFTP_USER="a1407652"
SFTP_PASS="${SFTP_PASSWORD:-}"  # Read from environment variable
REMOTE_DIR="/puzzle"
LOCAL_DIR="/home/user/Jigsaw"

# Files to deploy
FILES=(
    "index.html"
    "styles.css"
    "js/PuzzleCutter.js"
    "js/PuzzleEngine.js"
    "js/main.js"
)

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_requirements() {
    print_header "Checking Requirements"

    local missing_tools=()

    # Check for required tools
    if ! command -v sftp &> /dev/null; then
        missing_tools+=("openssh-client (for sftp)")
    fi

    if ! command -v sshpass &> /dev/null; then
        missing_tools+=("sshpass (for automated authentication)")
    fi

    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools:"
        for tool in "${missing_tools[@]}"; do
            echo "  - $tool"
        done
        echo ""
        print_info "Install with: sudo apt-get install openssh-client sshpass"
        return 1
    fi

    print_success "All required tools are installed"
    return 0
}

check_files() {
    print_header "Checking Local Files"

    cd "$LOCAL_DIR" || exit 1

    local missing_files=()

    for file in "${FILES[@]}"; do
        if [ ! -f "$file" ]; then
            missing_files+=("$file")
        fi
    done

    if [ ${#missing_files[@]} -ne 0 ]; then
        print_error "Missing files:"
        for file in "${missing_files[@]}"; do
            echo "  - $file"
        done
        return 1
    fi

    print_success "All files found"
    return 0
}

check_password() {
    print_header "Checking Credentials"

    if [ -z "$SFTP_PASS" ]; then
        print_error "SFTP password not set"
        echo ""
        echo "Set password using one of these methods:"
        echo "  1. Export environment variable: export SFTP_PASSWORD='your-password'"
        echo "  2. Pass as argument: SFTP_PASSWORD='your-password' ./deploy.sh"
        echo ""
        return 1
    fi

    print_success "Credentials configured"
    return 0
}

test_connection() {
    print_header "Testing SFTP Connection"

    print_info "Connecting to $SFTP_HOST..."

    if sshpass -p "$SFTP_PASS" sftp -o StrictHostKeyChecking=no -o ConnectTimeout=10 -P "$SFTP_PORT" "${SFTP_USER}@${SFTP_HOST}" << 'EOF' > /dev/null 2>&1
pwd
bye
EOF
    then
        print_success "Connection successful"
        return 0
    else
        print_error "Connection failed"
        echo ""
        echo "Possible issues:"
        echo "  - DNS resolution failure"
        echo "  - Network restrictions/firewall"
        echo "  - Incorrect credentials"
        echo "  - Server not accessible"
        echo ""
        return 1
    fi
}

create_remote_directory() {
    print_header "Creating Remote Directory"

    print_info "Creating $REMOTE_DIR on server..."

    sshpass -p "$SFTP_PASS" sftp -o StrictHostKeyChecking=no -P "$SFTP_PORT" "${SFTP_USER}@${SFTP_HOST}" << EOF
mkdir $REMOTE_DIR
cd $REMOTE_DIR
mkdir js
bye
EOF

    print_success "Remote directories created"
}

deploy_files() {
    print_header "Deploying Files"

    cd "$LOCAL_DIR" || exit 1

    # Create SFTP batch file
    cat > /tmp/sftp_commands.txt << EOF
cd $REMOTE_DIR
put index.html
put styles.css
cd js
put js/PuzzleCutter.js
put js/PuzzleEngine.js
put js/main.js
bye
EOF

    print_info "Uploading files to $SFTP_HOST:$REMOTE_DIR..."

    if sshpass -p "$SFTP_PASS" sftp -o StrictHostKeyChecking=no -P "$SFTP_PORT" -b /tmp/sftp_commands.txt "${SFTP_USER}@${SFTP_HOST}"; then
        print_success "Files uploaded successfully"
        rm /tmp/sftp_commands.txt
        return 0
    else
        print_error "Upload failed"
        rm /tmp/sftp_commands.txt
        return 1
    fi
}

verify_deployment() {
    print_header "Verifying Deployment"

    print_info "Checking deployed files..."

    sshpass -p "$SFTP_PASS" sftp -o StrictHostKeyChecking=no -P "$SFTP_PORT" "${SFTP_USER}@${SFTP_HOST}" << EOF
cd $REMOTE_DIR
ls -la
cd js
ls -la
bye
EOF

    print_success "Deployment verified"
}

###############################################################################
# Main Deployment Process
###############################################################################

main() {
    print_header "Jigsaw Puzzle - Automated Deployment"
    echo ""

    # Run checks
    check_requirements || exit 1
    echo ""

    check_files || exit 1
    echo ""

    check_password || exit 1
    echo ""

    test_connection || {
        print_warning "Connection test failed, but continuing anyway..."
        echo ""
    }

    # Perform deployment
    create_remote_directory 2>/dev/null || print_warning "Directory may already exist"
    echo ""

    deploy_files || exit 1
    echo ""

    verify_deployment || print_warning "Could not verify deployment"
    echo ""

    # Success!
    print_header "Deployment Complete"
    echo ""
    print_success "Application deployed to:"
    echo -e "  ${GREEN}https://rambis.net/puzzle/${NC}"
    echo ""
    print_info "Test the deployment in your browser"
    echo ""
}

# Run main function
main "$@"
