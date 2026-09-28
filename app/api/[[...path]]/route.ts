import { endpointNotFound } from '@/lib/endpoints'

/** Any path under /api that is not an endpoint, answered in the error envelope rather than the site's HTML 404 page. */
export const GET = endpointNotFound
export const POST = endpointNotFound
export const PUT = endpointNotFound
export const PATCH = endpointNotFound
export const DELETE = endpointNotFound
