import { useState } from "react";
import { Copy, Check, ExternalLink, Bot, Terminal, RefreshCw, Sparkles } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import SeoMeta from "@/components/SeoMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const APP_NAME = "Check-iN";
const APP_SLUG = "check-in";
const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseUrl = new URL(configuredSupabaseUrl);
const legacyLovableCloud =
  supabaseUrl.hostname.endsWith(".lovable.cloud") && !supabaseUrl.hostname.startsWith("c--");
const dataPlaneUrl = legacyLovableCloud
  ? `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`
  : supabaseUrl.toString().replace(/\/+$/, "");
const MCP_URL = `${dataPlaneUrl}/functions/v1/mcp`;
const CLAUDE_CODE_CMD = `claude mcp add --scope user --transport http ${APP_SLUG} '${MCP_URL}'`;

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied");
        setTimeout(() => setCopied(false), 1500);
      }}
      className="gap-1.5 shrink-0"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

const ConnectAssistant = () => {
  const claudePrefillUrl = `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent(APP_NAME)}&connectorUrl=${encodeURIComponent(MCP_URL)}`;

  return (
    <AppLayout>
      <SeoMeta
        title="Connect an AI Assistant"
        description="Connect ChatGPT, Claude, Claude Code, or any MCP-compatible AI assistant to your Check-iN account."
        canonicalPath="/connect"
      />
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Connect an AI Assistant
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Let ChatGPT, Claude, or another AI assistant access your Check-iN health data, medications, and appointments — securely, using your account.
          </p>
        </div>

        {/* MCP URL */}
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your Check-iN server URL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2 break-all font-mono">
                {MCP_URL}
              </code>
              <CopyBtn text={MCP_URL} />
            </div>
            <p className="text-xs text-muted-foreground">
              You'll paste this into your AI assistant's connector settings. The assistant will ask you to sign in to Check-iN and approve access.
            </p>
          </CardContent>
        </Card>

        {/* Connect steps */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Connect your assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="chatgpt">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="chatgpt" className="text-xs">ChatGPT</TabsTrigger>
                <TabsTrigger value="claude" className="text-xs">Claude</TabsTrigger>
                <TabsTrigger value="claude-code" className="text-xs">Code</TabsTrigger>
                <TabsTrigger value="other" className="text-xs">Other</TabsTrigger>
              </TabsList>

              <TabsContent value="chatgpt" className="space-y-3 pt-3 text-sm">
                <ol className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>
                    Open{" "}
                    <a href="https://chatgpt.com/#settings/Connectors/Advanced" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                      ChatGPT Connectors <ExternalLink className="w-3 h-3" />
                    </a>{" "}
                    and turn on <strong className="text-foreground">Developer mode</strong> (read the risk notice). If you don't see it, ask your ChatGPT admin to enable it.
                  </li>
                  <li>Click <strong className="text-foreground">Create app</strong> next to the back button.</li>
                  <li>Name it "Check-iN" and paste the server URL above.</li>
                  <li>Click <strong className="text-foreground">Create</strong>, then sign in to Check-iN and approve.</li>
                  <li>In a new chat, enable the app from the composer, then ask ChatGPT to use Check-iN.</li>
                </ol>
              </TabsContent>

              <TabsContent value="claude" className="space-y-3 pt-3 text-sm">
                <ol className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>
                    Click below — Claude opens the custom connector dialog with the details prefilled.
                  </li>
                  <li>Review and click <strong className="text-foreground">Add</strong>, then sign in to Check-iN and approve.</li>
                  <li>Enable the connector from the chat composer, then ask Claude to use Check-iN.</li>
                </ol>
                <Button asChild className="w-full gap-2">
                  <a href={claudePrefillUrl} target="_blank" rel="noopener noreferrer">
                    Add to Claude <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">
                  If the dialog doesn't open: go to Claude → Connectors → <strong>Add custom connector</strong>, then name it and paste the URL above.
                </p>
              </TabsContent>

              <TabsContent value="claude-code" className="space-y-3 pt-3 text-sm">
                <ol className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>Run this in a terminal:</li>
                </ol>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2 break-all font-mono">
                    {CLAUDE_CODE_CMD}
                  </code>
                  <CopyBtn text={CLAUDE_CODE_CMD} />
                </div>
                <ol start={2} className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>Start Claude Code and run <code className="bg-muted px-1 rounded">/mcp</code> — sign in to Check-iN when prompted.</li>
                  <li>Ask Claude Code to use Check-iN.</li>
                </ol>
              </TabsContent>

              <TabsContent value="other" className="space-y-3 pt-3 text-sm">
                <ol className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>Open your assistant's MCP server / custom connector settings.</li>
                  <li>Create a new <strong className="text-foreground">remote MCP server</strong> connection.</li>
                  <li>Name it "Check-iN" and paste the server URL above.</li>
                  <li>Complete the Check-iN sign-in and approval.</li>
                  <li>Enable the connection and ask the assistant to use Check-iN.</li>
                </ol>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Refresh */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              Refresh after Check-iN updates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              When Check-iN ships new features, refresh your connection so the assistant sees them.
            </p>
            <Tabs defaultValue="chatgpt">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="chatgpt" className="text-xs">ChatGPT</TabsTrigger>
                <TabsTrigger value="claude" className="text-xs">Claude</TabsTrigger>
                <TabsTrigger value="claude-code" className="text-xs">Code</TabsTrigger>
                <TabsTrigger value="other" className="text-xs">Other</TabsTrigger>
              </TabsList>
              <TabsContent value="chatgpt" className="pt-3 text-sm">
                <ol className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>Open ChatGPT app preferences and pick <strong className="text-foreground">Check-iN</strong> under Enabled apps.</li>
                  <li>Next to <strong className="text-foreground">Information</strong>, click <strong className="text-foreground">Refresh</strong>.</li>
                  <li>If the URL changed, paste the latest URL from above.</li>
                  <li>Start a new chat.</li>
                </ol>
              </TabsContent>
              <TabsContent value="claude" className="pt-3 text-sm">
                <ol className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>Open Connectors and select Check-iN.</li>
                  <li>Refresh or update the connector's tools.</li>
                  <li>If the URL changed, paste the latest URL from above.</li>
                </ol>
              </TabsContent>
              <TabsContent value="claude-code" className="pt-3 text-sm">
                <ol className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>Start a new Claude Code session — it picks up the latest tools automatically.</li>
                  <li>
                    If the URL changed, run{" "}
                    <code className="bg-muted px-1 rounded text-xs">claude mcp remove {APP_SLUG}</code>{" "}
                    then re-run the install command with the latest URL.
                  </li>
                </ol>
              </TabsContent>
              <TabsContent value="other" className="pt-3 text-sm">
                <ol className="list-decimal ml-5 space-y-2 text-muted-foreground">
                  <li>Open your assistant's MCP or connector settings.</li>
                  <li>Select the Check-iN connection.</li>
                  <li>Refresh the tool list, reload the server, or reconnect it.</li>
                  <li>If the URL changed, paste the latest URL from above.</li>
                </ol>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="bg-muted/40 border-dashed">
          <CardContent className="p-4 text-xs text-muted-foreground flex gap-3">
            <Terminal className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Your assistant connects as <em>you</em>. It can read your Check-iN health status, medications, and appointments. Disconnect any time from your assistant's connector settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default ConnectAssistant;
