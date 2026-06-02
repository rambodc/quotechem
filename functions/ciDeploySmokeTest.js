import { onRequest } from 'firebase-functions/v2/https';

export const ciDeploySmokeTest = onRequest({ region: 'us-central1' }, (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'quotechem-functions',
    functionName: 'ciDeploySmokeTest',
    marker: 'functions-only-deploy-check-2026-06-02',
    projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || null,
    deployedBy: 'github-actions',
    checkedAt: new Date().toISOString(),
  });
});
