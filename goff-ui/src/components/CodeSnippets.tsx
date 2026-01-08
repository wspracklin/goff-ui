'use client';

import { useState, useMemo } from 'react';
import { Copy, Check, Terminal, Monitor, Server, Key, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  SDKLanguage,
  SDKInfo,
  SDK_INFO,
  generateCodeSnippet,
  GenerateSnippetOptions,
  DEFAULT_ENABLED_SDKS,
} from '@/lib/sdk-snippets';
import { useSDKSettings, CODE_THEMES } from '@/lib/sdk-settings';

interface CodeSnippetsProps {
  flagKey: string;
  flagType?: 'boolean' | 'string' | 'number' | 'json';
  defaultValue?: string;
  relayProxyUrl?: string;
  apiKey?: string;
  flagSetName?: string;
}

// Language icons as simple text/emoji for now
const LANGUAGE_ICONS: Record<SDKLanguage, string> = {
  go: 'Go',
  java: 'Jv',
  dotnet: 'C#',
  python: 'Py',
  node: 'JS',
  php: 'PHP',
  ruby: 'Rb',
  javascript: 'JS',
  react: 'Rx',
  swift: 'Sw',
  kotlin: 'Kt',
};

export function CodeSnippets({
  flagKey,
  flagType = 'boolean',
  defaultValue = 'false',
  relayProxyUrl = 'http://localhost:1031',
  apiKey,
  flagSetName,
}: CodeSnippetsProps) {
  const { enabledSDKs, codeTheme } = useSDKSettings();
  const [copiedLanguage, setCopiedLanguage] = useState<string | null>(null);

  const themeColors = CODE_THEMES[codeTheme].colors;

  // Filter to only enabled SDKs
  const availableSDKs = useMemo(() => {
    return enabledSDKs
      .filter((id) => SDK_INFO[id])
      .map((id) => SDK_INFO[id]);
  }, [enabledSDKs]);

  // Separate into server and client SDKs
  const serverSDKs = useMemo(
    () => availableSDKs.filter((sdk) => sdk.type === 'server'),
    [availableSDKs]
  );
  const clientSDKs = useMemo(
    () => availableSDKs.filter((sdk) => sdk.type === 'client'),
    [availableSDKs]
  );

  // Default to first available SDK
  const [selectedTab, setSelectedTab] = useState<string>(
    availableSDKs[0]?.id || 'node'
  );

  const snippetOptions: GenerateSnippetOptions = {
    flagKey,
    flagType,
    defaultValue,
    relayProxyUrl,
    apiKey,
  };

  const handleCopy = async (language: SDKLanguage, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedLanguage(language);
      setTimeout(() => setCopiedLanguage(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (availableSDKs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Code Snippets
          </CardTitle>
          <CardDescription>
            No SDK languages enabled. Enable languages in Settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Code Snippets
        </CardTitle>
        <CardDescription>
          <span>Copy code to integrate this flag in your application</span>
          {apiKey && flagSetName && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full px-2.5 py-1">
                <Layers className="h-3 w-3" />
                <span>{flagSetName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full px-2.5 py-1">
                <Key className="h-3 w-3" />
                <span>API Key configured</span>
              </div>
            </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          {/* Server SDKs */}
          {serverSDKs.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-500">Server SDKs</span>
              </div>
              <TabsList className="flex-wrap h-auto gap-1">
                {serverSDKs.map((sdk) => (
                  <TabsTrigger key={sdk.id} value={sdk.id}>
                    <span className="mr-1.5 text-xs font-mono opacity-60">
                      {LANGUAGE_ICONS[sdk.id]}
                    </span>
                    {sdk.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}

          {/* Client SDKs */}
          {clientSDKs.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-500">Client SDKs</span>
              </div>
              <TabsList className="flex-wrap h-auto gap-1">
                {clientSDKs.map((sdk) => (
                  <TabsTrigger key={sdk.id} value={sdk.id}>
                    <span className="mr-1.5 text-xs font-mono opacity-60">
                      {LANGUAGE_ICONS[sdk.id]}
                    </span>
                    {sdk.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          )}

          {/* Content for each SDK */}
          {availableSDKs.map((sdk) => {
            const code = generateCodeSnippet(sdk.id, snippetOptions);
            const isCopied = copiedLanguage === sdk.id;

            return (
              <TabsContent key={sdk.id} value={sdk.id}>
                <div className="space-y-3 w-1/2 min-w-[400px]">
                  {/* Install command */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        Installation
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {sdk.type}
                      </Badge>
                    </div>
                    <div className="relative">
                      <pre
                        className="p-3 rounded-lg text-sm overflow-x-auto font-mono"
                        style={{
                          backgroundColor: themeColors.background,
                          color: themeColors.text,
                        }}
                      >
                        {sdk.installCmd}
                      </pre>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-7 w-7 p-0"
                        style={{ color: themeColors.text }}
                        onClick={() => navigator.clipboard.writeText(sdk.installCmd)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Code snippet */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        Usage Example
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-500">
                        {sdk.fileExtension}
                      </span>
                    </div>
                    <div className="relative">
                      <pre
                        className="p-4 rounded-lg text-sm overflow-x-auto font-mono max-h-96"
                        style={{
                          backgroundColor: themeColors.background,
                          color: themeColors.text,
                        }}
                      >
                        <code>{code}</code>
                      </pre>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2"
                        onClick={() => handleCopy(sdk.id, code)}
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default CodeSnippets;
