import { NextResponse } from 'next/server';

const FLAG_MANAGER_API_URL = process.env.FLAG_MANAGER_API_URL;
const DEV_MODE = process.env.DEV_MODE === 'true';

// GET - Get backend configuration
export async function GET() {
  try {
    // If no API URL configured, return basic info
    if (!FLAG_MANAGER_API_URL) {
      return NextResponse.json({
        gitProvider: '',
        gitConfigured: false,
        devMode: DEV_MODE,
        source: 'local',
      });
    }

    // Fetch config from Flag Manager API
    const response = await fetch(`${FLAG_MANAGER_API_URL}/api/config`);

    if (!response.ok) {
      return NextResponse.json({
        gitProvider: '',
        gitConfigured: false,
        devMode: DEV_MODE,
        source: 'api',
        error: 'Failed to fetch API config',
      });
    }

    const apiConfig = await response.json();

    return NextResponse.json({
      ...apiConfig,
      devMode: DEV_MODE,
      source: 'api',
    });
  } catch (error) {
    return NextResponse.json({
      gitProvider: '',
      gitConfigured: false,
      devMode: DEV_MODE,
      source: 'local',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
