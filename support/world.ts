import path from 'path';
import { setWorldConstructor, setDefaultTimeout, World, IWorldOptions } from '@cucumber/cucumber';
import { chromium, firefox, webkit } from 'playwright';
import type { Browser, BrowserContext, BrowserType, Page } from 'playwright';
import environment from '../lib/config/environment';
import ApiClient from '../lib/api/ApiClient';
import { createPages, Pages } from '../page-objects';

interface EngineDefinition {
  engine: BrowserType;
  channel?: string;
}

/** A second browser context: its own cookies, its own page objects. */
export interface IsolatedSession {
  context: BrowserContext;
  page: Page;
  api: ApiClient;
  pages: Pages;
}

/** Whatever the scenario under way needs to carry between its own steps. */
interface ScenarioState {
  [key: string]: any;
}

/**
 * The bundled engines, plus the branded Chromium channels for anyone who needs
 * to certify against the browser their users actually run. Only the bundled
 * three are in the matrix - see config/cucumber.config.ts for why - but adding
 * `chrome` or `msedge` to that list is all it takes.
 */
const ENGINES: Record<string, EngineDefinition> = {
  chromium: { engine: chromium },
  firefox: { engine: firefox },
  webkit: { engine: webkit },
  chrome: { engine: chromium, channel: 'chrome' },
  msedge: { engine: chromium, channel: 'msedge' }
};
const VIEWPORT = { width: 1440, height: 900 };
const CLOSE_TIMEOUT_MS = 15000;

/**
 * One browser per scenario. Cucumber runs scenarios in separate worker
 * processes, so sharing a browser across scenarios buys very little and makes
 * state leaks between tests much harder to reason about.
 */
export class OrangeHrmWorld extends World {
  environment = environment;

  browserName: string;

  baseUrl: string;

  timeout: number;

  // The Before hook calls `init()` before the first step runs and the After
  // hooks are the only thing that runs after `cleanup()`, so from a step's point
  // of view these are always present. Declaring them as such keeps every step
  // definition free of a null check that can never fire.
  browser!: Browser;

  context!: BrowserContext;

  page!: Page;

  api!: ApiClient;

  pages!: Pages;

  tracing = false;

  videoDir: string | null = null;

  private closed = false;

  // Set by the Before hook and read by the reporting hooks.
  scenarioName = '';

  scenarioTags: string[] = [];

  /** The file-name stem shared by this scenario's screenshot, trace and video. */
  evidenceSlug = '';

  anonymousContext?: BrowserContext;

  /** Record ids, so the After hook can delete whatever the scenario created. */
  created: { employees: number[]; users: number[]; candidates: number[] };

  state: ScenarioState;

  constructor(options: IWorldOptions) {
    super(options);

    this.browserName = this.parameters.browser || environment.execution.browser;
    this.baseUrl = environment.baseUrl;
    this.timeout = environment.timeouts.step;

    // Everything the scenario created, so the After hook can always clean up -
    // even when the scenario failed half way through the lifecycle.
    this.created = { employees: [], users: [], candidates: [] };
    this.state = {};
  }

  url(path = ''): string {
    return `${this.baseUrl}${path}`;
  }

  async init(): Promise<Page> {
    const { engine, channel } = ENGINES[this.browserName] || ENGINES.chromium;
    const isChromium = engine === chromium;

    this.browser = await engine.launch({
      headless: environment.execution.headless,
      slowMo: environment.execution.slowMo,
      ...(channel ? { channel } : {}),
      args: isChromium ? ['--no-sandbox', '--disable-dev-shm-usage'] : []
    });

    this.context = await this.browser.newContext({
      baseURL: this.baseUrl,
      viewport: VIEWPORT,
      ignoreHTTPSErrors: true,
      ...this.videoOptions()
    });

    this.context.setDefaultTimeout(environment.timeouts.action);
    this.context.setDefaultNavigationTimeout(environment.timeouts.navigation);

    this.page = await this.context.newPage();
    this.api = ApiClient.fromBrowserContext(this.context, this.baseUrl);
    this.pages = createPages(this.page);

    return this.page;
  }

  /**
   * Opens a second, isolated context. Used by the role-based scenarios so an ESS
   * session can be exercised without dropping the admin session.
   */
  async newIsolatedSession(): Promise<IsolatedSession> {
    const context = await this.browser.newContext({
      baseURL: this.baseUrl,
      viewport: VIEWPORT,
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    return {
      context,
      page,
      api: ApiClient.fromBrowserContext(context, this.baseUrl),
      pages: createPages(page)
    };
  }

  /**
   * Each scenario records into its own directory. Playwright only writes the
   * file when the context closes, so the last After hook decides whether to keep
   * it or throw it away.
   */
  videoOptions(): { recordVideo?: { dir: string; size: typeof VIEWPORT } } {
    if (environment.stability.video === 'off') return {};

    this.videoDir = path.join(
      'reports',
      this.browserName,
      'videos',
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );

    return { recordVideo: { dir: this.videoDir, size: VIEWPORT } };
  }

  /**
   * Playwright traces are the fastest way to understand a failure that only
   * happens on CI: they replay the DOM, the network and the console for every
   * action. Recording is cheap enough to leave on and throw away on success.
   */
  async startTracing(): Promise<void> {
    if (environment.stability.trace === 'off' || !this.context) return;

    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    this.tracing = true;
  }

  async stopTracing(filePath?: string): Promise<string | null> {
    if (!this.tracing || !this.context) return null;

    this.tracing = false;
    if (filePath) {
      await this.context.tracing.stop({ path: filePath });
      return filePath;
    }

    await this.context.tracing.stop();
    return null;
  }

  /**
   * An API client with no session at all, for the scenarios that assert what an
   * anonymous caller is allowed to see.
   */
  async newAnonymousApi(): Promise<ApiClient> {
    const context = await this.browser.newContext({ baseURL: this.baseUrl });
    this.anonymousContext = context;
    return ApiClient.fromBrowserContext(context, this.baseUrl);
  }

  async screenshot(): Promise<Buffer | null> {
    if (!this.page || this.page.isClosed()) return null;
    return this.page.screenshot({ fullPage: true });
  }

  /**
   * Closing a browser whose page is wedged can hang, and a hung teardown holds
   * the whole worker. The close is raced against a timeout; the process exits
   * either way, so a leaked browser is cleaned up with it.
   */
  async cleanup(): Promise<void> {
    // Several After hooks run in sequence and any of them can decide the run is
    // over, so closing has to be idempotent.
    if (this.closed || !this.browser) return;
    this.closed = true;

    const { browser } = this;

    await Promise.race([
      browser.close().catch(() => {}),
      // guardrail-allow: no-fixed-waits - a teardown watchdog, not a wait on the application
      new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS))
    ]);
  }
}

setDefaultTimeout(environment.timeouts.step);
setWorldConstructor(OrangeHrmWorld);
