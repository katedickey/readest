import { NextResponse } from 'next/server';
import { getRuntimeConfig } from '@/services/runtimeConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rc = getRuntimeConfig();
  const payload = {
    supabaseUrl: rc?.supabaseUrl ?? process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    supabaseAnonKey: rc?.supabaseAnonKey ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    objectStorageType: rc?.objectStorageType ?? process.env['OBJECT_STORAGE_TYPE'] ?? 'r2',
    s3Endpoint: process.env['S3_PUBLIC_ENDPOINT'] ?? process.env['S3_ENDPOINT'] ?? '',
    s3BucketName: process.env['S3_BUCKET_NAME'] ?? '',
    s3Region: process.env['S3_REGION'] ?? 'auto',
    apiBaseUrl: rc?.apiBaseUrl ?? process.env['API_BASE_URL'] ?? '',
  };
  return NextResponse.json(payload, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
