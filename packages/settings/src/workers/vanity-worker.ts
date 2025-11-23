/// <reference lib="webworker" />

import { convertKeyPairToJson } from '@workspace/keypair/convert-key-pair-to-json'
import { generateVanityKeyPair, VANITY_MAX_ATTEMPTS } from '@workspace/keypair/generate-vanity-key-pair'

type VanityWorkerInput = {
  caseSensitive?: boolean
  prefix?: string
  suffix?: string
}

type VanityWorkerMessage =
  | { payload: number; type: 'progress' }
  | { payload: { address: string; attempts: number; secretKey: string }; type: 'found' }
  | { payload: string; type: 'error' }

const PROGRESS_INTERVAL = 1000

self.onmessage = async (event: MessageEvent<VanityWorkerInput>) => {
  const { caseSensitive = true, prefix = '', suffix = '' } = event.data ?? {}
  const sanitizedPrefix = prefix.trim().slice(0, 4)
  const sanitizedSuffix = suffix.trim().slice(0, 4)
  const hasPrefix = sanitizedPrefix.length > 0
  const hasSuffix = sanitizedSuffix.length > 0

  if (!hasPrefix && !hasSuffix) {
    const errorMessage: VanityWorkerMessage = {
      payload: 'Enter a prefix or suffix',
      type: 'error',
    }
    self.postMessage(errorMessage)
    return
  }

  try {
    let latestAttempts = 0
    const result = await generateVanityKeyPair({
      caseSensitive,
      maxAttempts: VANITY_MAX_ATTEMPTS,
      onAttempt: (value) => {
        latestAttempts = value
        if (value === 1 || value % PROGRESS_INTERVAL === 0) {
          const progressMessage: VanityWorkerMessage = { payload: value, type: 'progress' }
          self.postMessage(progressMessage)
        }
      },
      prefix: caseSensitive ? sanitizedPrefix : sanitizedPrefix.toLowerCase(),
      suffix: caseSensitive ? sanitizedSuffix : sanitizedSuffix.toLowerCase(),
    })
    const secretKey = await convertKeyPairToJson(result.signer.keyPair)
    const foundMessage: VanityWorkerMessage = {
      payload: {
        address: result.signer.address,
        attempts: latestAttempts || result.attempts,
        secretKey,
      },
      type: 'found',
    }
    self.postMessage(foundMessage)
  } catch (error) {
    const errorMessage: VanityWorkerMessage = {
      payload: error instanceof Error ? error.message : 'Unknown worker error',
      type: 'error',
    }
    self.postMessage(errorMessage)
  }
}
