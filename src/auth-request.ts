import {EventSource, FetchLike} from 'eventsource'
import fetch, {RequestInit} from 'node-fetch'
import {fetch as fetchNative} from 'node-fetch-native/proxy'

import {DiscoConfig} from './config.js'
import {Readable} from 'node:stream'

export interface EventWithMessage extends Event {
  message?: string
}

interface Handlers {
  onMessage: (event: MessageEvent) => void
}

export function readEventSource(url: string, discoConfig: DiscoConfig, handlers: Handlers): Promise<void> {
  const es = new EventSource(url, {
    fetch: (input, init) =>
      fetchNative(input, {
        ...init,
        headers: {
          ...init?.headers,
          Accept: 'text/event-stream',
          Authorization: 'Basic ' + Buffer.from(`${discoConfig.apiKey}:`).toString('base64'),
        },
      }),
  })

  // don't catch errors -- let eventsource 'handle'
  // them by trying to reconnect..?
  // ... or throw error and close connection?
  // 'output' is our way of saying that we're sending a message
  es.addEventListener('output', handlers.onMessage)

  // handler below only used for meta:stats handler
  es.addEventListener('stats', handlers.onMessage)

  // sending 'end' is our way of signaling that we want to close the connection
  return new Promise((resolve) => {
    es.addEventListener('end', () => {
      es.close()
      resolve()
    })
  })
}

export function request({
  method,
  url,
  discoConfig,
  body,
  expectedStatuses = [200],
  extraHeaders,
  bodyStream,
}: {
  method: string
  url: string
  discoConfig: DiscoConfig
  body?: unknown
  expectedStatuses?: number[]
  extraHeaders?: Record<string, string>
  bodyStream?: Readable
}) {
  const params: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${discoConfig.apiKey}:`).toString('base64'),
    },
  }

  if (method === 'POST') {
    params.headers = {
      ...params.headers,
      'Content-Type': 'application/json',
    }

    params.body = JSON.stringify(body)
  }

  if (extraHeaders !== undefined) {
    params.headers = {
      ...params.headers,
      ...extraHeaders,
    }
  }

  if (bodyStream) {
    params.body = bodyStream
  }

  return fetch(url, params).then(async (res) => {
    if (!expectedStatuses.includes(res.status)) {
      throw new Error(`HTTP error: ${res.status} ${await res.text()}`)
    }

    // send back the server response so that caller
    // can access .status and .json
    return res
  })
}
