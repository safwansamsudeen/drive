// Downloads are served by storage (S3 presigned URL / nginx / disk) with HTTP
// Range support, so the browser resumes on flaky connections instead of
// restarting, and no server worker is held open for the transfer.
//
// Single files stream directly. Folders / multi-selections are built into a zip
// by a background job (drive.api.files.download_folder); we poll for it and then
// download the finished archive — so a large folder can never time out midway
// into a corrupt half-zip.

import { call } from 'frappe-ui'
import { toast } from '@/utils/toasts'

export function entitiesDownload(entities, transfer = false) {
  // Single file → resumable direct download (supports transfer links).
  if (entities.length === 1 && !entities[0].is_folder) {
    window.location.href = `/api/method/drive.api.files.get_file_content?entity_name=${
      entities[0].name
    }&trigger_download=1${transfer ? '&transfer=1' : ''}`
    return
  }

  prepareArchive(entities)
}

async function prepareArchive(entities) {
  const names = JSON.stringify(entities.map((entity) => entity.name))
  try {
    const { token } = await call('drive.api.files.download_folder', { entities: names })
    toast('Preparing download…')
    const result = await pollArchive(token)
    if (result.status !== 'ready') {
      toast({ title: result.error || 'Could not prepare this download', type: 'error' })
      return
    }
    window.location.href = `/api/method/drive.api.files.download_archive?token=${encodeURIComponent(
      token
    )}`
  } catch (error) {
    toast({ title: error?.message || 'Download failed', type: 'error' })
  }
}

function pollArchive(token, { interval = 2000, timeout = 30 * 60 * 1000 } = {}) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await call('drive.api.files.download_status', { token })
        if (res.status === 'ready' || res.status === 'failed') return resolve(res)
        if (Date.now() - start > timeout) return reject(new Error('Timed out preparing download'))
        setTimeout(tick, interval)
      } catch (error) {
        reject(error)
      }
    }
    tick()
  })
}
