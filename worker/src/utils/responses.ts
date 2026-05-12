/**
 * Response hulpfuncties voor consistente API responses
 */

import type { Env } from '../index';

export function corsHeaders(env?: Env): HeadersInit {
  const origin = env?.APP_URL || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(data: unknown, status = 200, env?: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env),
    },
  });
}

export function errorResponse(message: string, status = 400, env?: Env): Response {
  return jsonResponse({ error: true, message }, status, env);
}

export function successResponse(data: unknown = null, message?: string, env?: Env): Response {
  return jsonResponse({ success: true, data, message }, 200, env);
}

export function paginatedResponse(
  data: unknown[],
  total: number,
  page: number,
  perPage: number,
  env?: Env
): Response {
  return jsonResponse({
    success: true,
    data,
    pagination: {
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    }
  }, 200, env);
}
