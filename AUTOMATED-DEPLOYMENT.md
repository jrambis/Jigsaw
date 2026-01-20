# Automated Deployment Setup

This document explains what's needed to enable automated SFTP deployment for the Jigsaw Puzzle application.

## Current Situation

✅ **Installed:** OpenSSH client tools (sftp, scp, ssh)
✅ **Installed:** sshpass for automated authentication
❌ **Issue:** DNS resolution not working in this environment
❌ **Issue:** Network restrictions prevent external connections

## What's Needed for Automated Deployment

### 1. Network Connectivity

The current environment has these limitations:

**DNS Resolution Failure:**
```
ssh: Could not resolve hostname access-5019433264.webspace-host.com:
Temporary failure in name resolution
```

**Proxy Restrictions:**
```
HTTP/1.1 403 Forbidden
x-deny-reason: host_not_allowed
```

**To Fix:**
- Enable DNS resolution (working /etc/resolv.conf)
- Allow outbound connections to your SFTP server
- Remove proxy restrictions for deployment hosts

### 2. Required Packages (Already Installed)

✅ `openssh-client` - Provides sftp, scp, ssh commands
✅ `sshpass` - Enables non-interactive password authentication

**Installation commands (for reference):**
```bash
apt-get update
apt-get install -y openssh-client sshpass
```

### 3. Environment Variables

For security, credentials should be set as environment variables:

```bash
export SFTP_PASSWORD="xucjox-dymvE0-soxbim"
```

Then run deployment:
```bash
./deploy.sh
```

Or pass inline:
```bash
SFTP_PASSWORD="xucjox-dymvE0-soxbim" ./deploy.sh
```

## Deployment Script Usage

Once network connectivity is resolved, use the automated script:

### Basic Usage

```bash
# Set password
export SFTP_PASSWORD="your-password-here"

# Run deployment
cd /home/user/Jigsaw
./deploy.sh
```

### What the Script Does

1. ✓ Checks for required tools (sftp, sshpass)
2. ✓ Verifies all local files exist
3. ✓ Tests SFTP connection
4. ✓ Creates remote directories if needed
5. ✓ Uploads all application files
6. ✓ Verifies deployment
7. ✓ Shows deployment URL

### Script Features

- **Color-coded output** for easy reading
- **Pre-deployment validation** of files and tools
- **Connection testing** before upload
- **Automatic retry logic** (can be enhanced)
- **Verification** of uploaded files
- **Error handling** with clear messages

## Alternative Solutions

If network restrictions can't be resolved, here are alternatives:

### Option 1: GitHub Actions CI/CD

Create a GitHub Actions workflow that deploys on push:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Ionos

on:
  push:
    branches: [ main, master ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Deploy via SFTP
        uses: wlixcc/SFTP-Deploy-Action@v1.2.4
        with:
          server: 'access-5019433264.webspace-host.com'
          username: 'a1407652'
          password: ${{ secrets.SFTP_PASSWORD }}
          remote_path: '/puzzle'
          local_path: './'
```

**Pros:**
- Automated deployment on every push
- Runs in GitHub's infrastructure (no local network issues)
- Free for public/private repos
- Easy to set up

**Cons:**
- Requires GitHub account
- Credentials stored as GitHub secrets
- Only deploys on git push

### Option 2: Local Script (Different Machine)

Run the deployment script from a machine with proper network access:

1. Clone the repository to your local computer
2. Install required tools (on macOS/Linux):
   ```bash
   # macOS (with Homebrew)
   brew install sshpass

   # Linux (Ubuntu/Debian)
   sudo apt-get install openssh-client sshpass
   ```
3. Run the deployment script:
   ```bash
   cd /path/to/Jigsaw
   SFTP_PASSWORD="your-password" ./deploy.sh
   ```

### Option 3: VS Code SFTP Extension

Use VS Code with SFTP extension for automatic sync:

1. Install "SFTP" extension by Natizyskunk
2. Create `.vscode/sftp.json`:
   ```json
   {
     "name": "Rambis Puzzle",
     "host": "access-5019433264.webspace-host.com",
     "protocol": "sftp",
     "port": 22,
     "username": "a1407652",
     "password": "xucjox-dymvE0-soxbim",
     "remotePath": "/puzzle",
     "uploadOnSave": true,
     "ignore": [".git", "node_modules", "*.md"]
   }
   ```
3. Files auto-upload on save

### Option 4: FileZilla Bookmarks

Save connection in FileZilla for one-click deployment:

1. Open FileZilla
2. File → Site Manager → New Site
3. Configure:
   - Protocol: SFTP
   - Host: access-5019433264.webspace-host.com
   - Port: 22
   - User: a1407652
   - Password: (save password)
4. Click "Connect"
5. Bookmark the `/puzzle` directory
6. Drag & drop files to deploy

## Testing the Current Setup

To test if network connectivity works:

```bash
# Test DNS resolution
getent hosts access-5019433264.webspace-host.com

# Test SFTP connection
export SFTP_PASSWORD="xucjox-dymvE0-soxbim"
./deploy.sh
```

**Expected Success Output:**
```
========================================
Testing SFTP Connection
========================================
ℹ Connecting to access-5019433264.webspace-host.com...
✓ Connection successful

========================================
Deploying Files
========================================
ℹ Uploading files to access-5019433264.webspace-host.com:/puzzle...
✓ Files uploaded successfully

========================================
Deployment Complete
========================================
✓ Application deployed to:
  https://rambis.net/puzzle/
```

**Current Error:**
```
✗ Connection failed
Possible issues:
  - DNS resolution failure
  - Network restrictions/firewall
  - Incorrect credentials
  - Server not accessible
```

## Recommended Solution

**Best approach:** Use **GitHub Actions** (Option 1)

**Why:**
- ✅ No network restrictions
- ✅ Automated on git push
- ✅ Free and reliable
- ✅ No manual intervention needed
- ✅ Deployment history in GitHub
- ✅ Can add testing before deployment

**Setup time:** ~5 minutes

Would you like me to set up GitHub Actions for automated deployment?

## Security Notes

### Current Security Concerns

⚠️ Password stored in plain text in these files:
- This documentation
- deploy.sh (commented)
- DEPLOYMENT.md

### Recommendations

1. **Use environment variables** instead of hardcoding
2. **Use SSH keys** instead of password authentication
3. **Rotate password** after documentation is complete
4. **Use GitHub Secrets** for GitHub Actions
5. **Add .env to .gitignore** (already done)
6. **Consider creating dedicated deployment user** with limited permissions

### Setting Up SSH Key Authentication

More secure alternative to password:

```bash
# 1. Generate SSH key (on local machine)
ssh-keygen -t ed25519 -f ~/.ssh/ionos_deploy

# 2. Add public key to Ionos hosting
# (via Ionos control panel or authorized_keys file)

# 3. Deploy using key
sftp -i ~/.ssh/ionos_deploy -P 22 a1407652@access-5019433264.webspace-host.com
```

## Summary

**What's working:**
- ✅ Deployment script created
- ✅ Required tools installed
- ✅ Credentials configured
- ✅ Manual deployment successful

**What's blocked:**
- ❌ DNS resolution in current environment
- ❌ Network connectivity restrictions

**Next steps:**
1. **Immediate:** Continue using manual deployment (FileZilla/Web File Manager)
2. **Short-term:** Set up GitHub Actions for automated deployment
3. **Long-term:** Move to SSH key authentication for better security

---

**Need help setting up any of these options?** Let me know which approach you'd prefer!
