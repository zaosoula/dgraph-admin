import { defineEventHandler, readBody, getQuery, getRouterParam } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    // Get the target URL from the query parameters
    const query = getQuery(event)
    const targetUrl = query.url as string

    if (!targetUrl) {
      return {
        error: {
          message: 'Missing target URL',
          code: 'MISSING_URL'
        }
      }
    }

    // Get the path parameter (everything after /api/dgraph/)
    const path = getRouterParam(event, 'path') || ''
    
    // Construct the full URL to the Dgraph endpoint
    const fullUrl = `${targetUrl}/${path}`
    
    // Get request method and body
    const method = event.node.req.method || 'GET'
    const body = method !== 'GET' && method !== 'HEAD' ? await readBody(event).catch(() => null) : null
    
    // Get headers from the request, excluding host and connection headers
    const headers: Record<string, string> = {}
    const requestHeaders = event.node.req.headers
    
    for (const key in requestHeaders) {
      if (
        key !== 'host' && 
        key !== 'connection' && 
        key !== 'content-length' &&
        !key.startsWith('sec-') &&
        !key.startsWith('cf-')
      ) {
        const value = requestHeaders[key]
        if (typeof value === 'string') {
          headers[key] = value
        }
      }
    }
    
    // Make the request to the Dgraph endpoint
    const response = await fetch(fullUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    })
    
    // Get the response data
    const responseData = await response.json().catch(() => null)
    
    // Return the response
    return {
      status: response.status,
      statusText: response.statusText,
      data: responseData
    }
  } catch (error) {
    console.error('Dgraph proxy error:', error)
    
    return {
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'PROXY_ERROR'
      }
    }
  }
})
