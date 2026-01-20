# GitHub Actions - Automated Deployment Setup

This guide will help you set up automated deployment using GitHub Actions. Every time you push code, it will automatically deploy to rambis.net/puzzle.

## 🎯 Quick Setup (5 minutes)

### Step 1: Push the Workflow to GitHub

The workflow file is already created at `.github/workflows/deploy.yml`. Just push it:

```bash
# Push the current branch
git push origin claude/add-touch-controls-4GPXy
```

### Step 2: Add the SFTP Password as a GitHub Secret

1. **Go to your GitHub repository**
   - Open https://github.com/jrambis/Jigsaw (or your repo URL)

2. **Navigate to Settings**
   - Click the "Settings" tab at the top

3. **Open Secrets and Variables**
   - In the left sidebar, click "Secrets and variables"
   - Click "Actions"

4. **Create New Secret**
   - Click "New repository secret" button
   - Name: `SFTP_PASSWORD`
   - Value: `xucjox-dymvE0-soxbim`
   - Click "Add secret"

### Step 3: Test the Workflow

**Option A: Automatic (on push)**
```bash
# Make any change and push
git commit --allow-empty -m "Test GitHub Actions deployment"
git push origin claude/add-touch-controls-4GPXy
```

**Option B: Manual trigger**
1. Go to your repo on GitHub
2. Click "Actions" tab
3. Click "Deploy to Ionos Hosting" workflow
4. Click "Run workflow" dropdown
5. Select your branch
6. Click "Run workflow" button

### Step 4: Watch the Deployment

1. Go to "Actions" tab in your GitHub repository
2. You'll see the deployment running
3. Click on the workflow run to see live logs
4. Wait for ✅ green checkmark (usually 30-60 seconds)

### Step 5: Verify

Open https://rambis.net/puzzle/ in your browser to see the deployed app!

## 📋 Workflow Details

### When Does It Deploy?

The workflow triggers on:
- ✅ Push to `main` branch
- ✅ Push to `master` branch
- ✅ Push to `claude/add-touch-controls-4GPXy` branch
- ✅ Manual trigger from Actions tab

### What Does It Deploy?

All files in the repository:
- `index.html`
- `styles.css`
- `js/PuzzleCutter.js`
- `js/PuzzleEngine.js`
- `js/main.js`

Excludes (automatically):
- `.git/` directory
- `.github/` directory
- Documentation files (they won't break anything if deployed)

### Deployment Target

- **Server:** access-5019433264.webspace-host.com
- **Path:** `/puzzle`
- **URL:** https://rambis.net/puzzle/

## 🔧 Workflow Configuration

### Current Settings

```yaml
on:
  push:
    branches:
      - main
      - master
      - claude/add-touch-controls-4GPXy
  workflow_dispatch: # Manual trigger
```

### Customizing Triggers

Want to deploy only on specific branches? Edit `.github/workflows/deploy.yml`:

**Deploy only on main:**
```yaml
on:
  push:
    branches:
      - main
```

**Deploy on any branch:**
```yaml
on:
  push:
    branches:
      - '**'
```

**Deploy only on tags:**
```yaml
on:
  push:
    tags:
      - 'v*'
```

## 📊 Monitoring Deployments

### View Deployment History

1. Go to your repo on GitHub
2. Click "Actions" tab
3. See all deployment runs with status

### Check Deployment Logs

1. Click on any workflow run
2. Click "Deploy to rambis.net/puzzle"
3. View detailed logs for each step

### Deployment Status Badge

Add this to your README.md to show deployment status:

```markdown
![Deploy Status](https://github.com/jrambis/Jigsaw/workflows/Deploy%20to%20Ionos%20Hosting/badge.svg)
```

## ❌ Troubleshooting

### Secret Not Found

**Error:** `secrets.SFTP_PASSWORD` is not set

**Fix:**
1. Go to Settings → Secrets and variables → Actions
2. Verify secret name is exactly `SFTP_PASSWORD` (case-sensitive)
3. Re-add the secret if needed

### Connection Timeout

**Error:** SFTP connection timeout

**Fix:**
- Check Ionos hosting is accessible
- Verify firewall allows GitHub Actions IPs
- Check credentials are correct

### Permission Denied

**Error:** Permission denied on `/puzzle`

**Fix:**
- Verify the `/puzzle` directory exists
- Check SFTP user has write permissions
- Try creating directory manually first

### Files Not Updating

**Issue:** Old files still showing on website

**Fix:**
- Clear browser cache (Ctrl + F5)
- Check deployment logs show success
- Wait 1-2 minutes for CDN/cache
- Verify correct branch is deploying

## 🔒 Security Best Practices

### ✅ Current Security

- ✅ Password stored as encrypted GitHub secret
- ✅ Secret never exposed in logs
- ✅ Only accessible to repository workflows
- ✅ Can be rotated anytime

### 🔐 Enhanced Security (Optional)

**Use SSH Key Instead of Password:**

1. Generate SSH key:
   ```bash
   ssh-keygen -t ed25519 -f ionos_deploy_key -N ""
   ```

2. Add public key to Ionos (in their control panel)

3. Add private key as GitHub secret named `SFTP_SSH_KEY`

4. Update workflow:
   ```yaml
   - name: Deploy via SFTP
     uses: wlixcc/SFTP-Deploy-Action@v1.2.4
     with:
       server: 'access-5019433264.webspace-host.com'
       port: 22
       username: 'a1407652'
       ssh_private_key: ${{ secrets.SFTP_SSH_KEY }}
       local_path: './*'
       remote_path: '/puzzle'
   ```

## 🚀 Advanced Usage

### Deploy Specific Files Only

Edit the workflow to deploy only application files:

```yaml
- name: Deploy via SFTP
  uses: wlixcc/SFTP-Deploy-Action@v1.2.4
  with:
    server: 'access-5019433264.webspace-host.com'
    port: 22
    username: 'a1407652'
    password: ${{ secrets.SFTP_PASSWORD }}
    local_path: './index.html ./styles.css ./js/*'
    remote_path: '/puzzle'
```

### Add Pre-Deployment Tests

Add testing before deployment:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          # Add your tests here
          echo "Running tests..."

  deploy:
    needs: test  # Only deploy if tests pass
    runs-on: ubuntu-latest
    # ... rest of deploy job
```

### Add Slack/Discord Notifications

Get notified when deployments complete:

```yaml
- name: Notify Slack
  if: always()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Multiple Environments

Deploy to staging and production:

```yaml
on:
  push:
    branches:
      - develop  # Deploy to staging
      - main     # Deploy to production

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Set environment
        run: |
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            echo "ENV=production" >> $GITHUB_ENV
            echo "REMOTE_PATH=/puzzle" >> $GITHUB_ENV
          else
            echo "ENV=staging" >> $GITHUB_ENV
            echo "REMOTE_PATH=/puzzle-staging" >> $GITHUB_ENV
          fi

      - name: Deploy
        uses: wlixcc/SFTP-Deploy-Action@v1.2.4
        with:
          remote_path: ${{ env.REMOTE_PATH }}
          # ... other settings
```

## 📚 Workflow File Location

```
/home/user/Jigsaw/.github/workflows/deploy.yml
```

## ✨ Benefits of GitHub Actions

- ✅ **Automatic deployment** on every push
- ✅ **No manual uploads** needed
- ✅ **Deployment history** and logs
- ✅ **Rollback capability** (revert commit and push)
- ✅ **Free for public/private repos**
- ✅ **Can add tests** before deployment
- ✅ **Team collaboration** (everyone can trigger)
- ✅ **Status badges** for README

## 🎓 Next Steps

Once deployment is working:

1. **Merge to main branch** for production deployments
2. **Add tests** to ensure code quality
3. **Set up staging environment** for testing changes
4. **Add notifications** for deployment status
5. **Continue with Phase 3** (PHP Persistence)

## 📞 Need Help?

- View workflow runs: `https://github.com/jrambis/Jigsaw/actions`
- GitHub Actions docs: https://docs.github.com/actions
- SFTP Deploy Action: https://github.com/wlixcc/SFTP-Deploy-Action

---

**Ready to deploy?** Just push your code and watch it automatically deploy! 🚀
