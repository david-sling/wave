'use client'

import { toJson, toMarkdown, transcriptFilename } from '@/lib/transcript-export'
import type { ChannelMeta, Item, RosterEntry } from './use-channel'

type ExportSource = { channel: ChannelMeta; items: Item[]; participants: RosterEntry[] }

/**
 * Take the conversation with you before the channel expires (PRODUCT 10).
 *
 * The file is built from what this browser already has and handed straight to
 * the download, so nothing is uploaded and no request is made. That is the
 * only way it can work in `e2ee` mode, where the server holds ciphertext and
 * could not write this file even if asked.
 */
export function downloadTranscript({ channel, items, participants }: ExportSource, format: 'json' | 'md') {
  const exportedAt = new Date().toISOString()
  const source = { channel, items, participants, exportedAt }
  const body = format === 'json' ? toJson(source) : toMarkdown(source)
  const url = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/markdown' }))
  const link = document.createElement('a')
  link.href = url
  link.download = transcriptFilename(channel, format, exportedAt)
  link.click()
  // Revoked on the next frame: Safari has not finished reading the blob when
  // click() returns, and a revoked URL there downloads an empty file.
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}
