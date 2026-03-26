import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

type DigestSummary = {
  id: string;
};

type FeedItem = {
  documentId: string;
  referenceUrl: string;
  title: string;
};

type Feed = {
  id: string;
  items: FeedItem[];
};

type DashboardPayload = {
  feeds: Feed[];
  summary: {
    digests: DigestSummary[];
  };
};

type DigestPayload = {
  documents: Array<{
    document_id: string;
  }>;
};

async function findByDataAttr(locator: Locator, name: string, value: string) {
  const values = await locator.evaluateAll(
    (nodes, attributeName) =>
      nodes.map((node) => node.getAttribute(attributeName as string)),
    name,
  );
  const index = values.findIndex((candidate) => candidate === value);
  if (index >= 0) {
    return locator.nth(index);
  }

  throw new Error(`Could not find ${name}=${value}`);
}

async function waitForByDataAttr(locator: Locator, name: string, value: string) {
  await expect
    .poll(async () => {
      const values = await locator.evaluateAll(
        (nodes, attributeName) =>
          nodes.map((node) => node.getAttribute(attributeName as string)),
        name,
      );
      return values.some((candidate) => candidate === value);
    })
    .toBe(true);

  return findByDataAttr(locator, name, value);
}

async function fetchDashboard(request: APIRequestContext): Promise<DashboardPayload> {
  const response = await request.get("/api/dashboard?session=active");
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as DashboardPayload;
}

async function fetchDigest(
  request: APIRequestContext,
  digestId: string,
): Promise<DigestPayload> {
  const response = await request.get(
    `/api/digests/${encodeURIComponent(digestId)}?session=active`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as DigestPayload;
}

async function getVisibleFirstDocumentIds(page: Page) {
  return page.locator("[data-panel-item-id]").evaluateAll((panels) =>
    panels
      .map((panel) =>
        panel
          .querySelector("[data-feed-item-document-id]")
          ?.getAttribute("data-feed-item-document-id"),
      )
      .filter((value): value is string => Boolean(value)),
  );
}

test.describe.configure({ mode: "serial" });

test("first item from every feed opens the correct in-app document detail", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() => page.locator("[data-panel-item-id]").count())
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.locator("[data-feed-item-document-id]").count())
    .toBeGreaterThan(0);

  const panelCount = await page.locator("[data-panel-item-id]").count();
  const firstDocumentIds = await getVisibleFirstDocumentIds(page);
  expect(firstDocumentIds.length).toBe(panelCount);

  for (const documentId of firstDocumentIds) {
    let button: Locator;
    try {
      button = await waitForByDataAttr(
        page.locator("[data-feed-item-document-id]"),
        "data-feed-item-document-id",
        documentId,
      );
    } catch (error) {
      throw new Error(
        `Could not find source panel button for ${documentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await button.scrollIntoViewIfNeeded();
    await button.click();

    try {
      await expect(
        await waitForByDataAttr(
          page.locator("[data-document-detail-id]"),
          "data-document-detail-id",
          documentId,
        ),
      ).toBeVisible();
    } catch (error) {
      throw new Error(
        `Could not open document detail for ${documentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await page.getByRole("button", { name: "back to list" }).click();
    await expect
      .poll(() => page.locator("[data-feed-item-document-id]").count())
      .toBeGreaterThan(0);
  }
});

test("each digest opens and its first related document is reachable in the UI", async ({
  page,
  request,
}) => {
  const dashboard = await fetchDashboard(request);

  await page.goto("/");
  await expect(page.locator("[data-digest-id]")).toHaveCount(
    dashboard.summary.digests.length,
  );

  for (const digest of dashboard.summary.digests) {
    const digestPayload = await fetchDigest(request, digest.id);
    const firstDocumentId = digestPayload.documents[0]?.document_id;
    const digestButton = await waitForByDataAttr(
      page.locator("[data-digest-id]"),
      "data-digest-id",
      digest.id,
    );

    await digestButton.scrollIntoViewIfNeeded();
    await digestButton.click();

    await expect(
      await waitForByDataAttr(
        page.locator("[data-digest-detail-id]"),
        "data-digest-detail-id",
        digest.id,
      ),
    ).toBeVisible();

    if (!firstDocumentId) {
      continue;
    }

    const relatedDocumentButton = await waitForByDataAttr(
      page.locator("[data-related-document-id]"),
      "data-related-document-id",
      firstDocumentId,
    );
    await relatedDocumentButton.scrollIntoViewIfNeeded();
    await relatedDocumentButton.click();

    await expect(
      await waitForByDataAttr(
        page.locator("[data-document-detail-id]"),
        "data-document-detail-id",
        firstDocumentId,
      ),
    ).toBeVisible();
  }
});

test("browser can navigate to the first online link from every feed", async ({
  browser,
  request,
}) => {
  test.slow();
  const dashboard = await fetchDashboard(request);
  const firstItems = dashboard.feeds
    .map((feed) => feed.items[0])
    .filter((item): item is FeedItem => Boolean(item));
  const failures: string[] = [];

  for (const item of firstItems) {
    let recordedFailure: string | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        const response = await page.goto(item.referenceUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const status = response?.status() ?? 0;
        const finalUrl = page.url();
        const title = (await page.title()).trim();
        const normalizedTitle = title.toLowerCase();

        if (
          status >= 400 ||
          finalUrl === "about:blank" ||
          title.length === 0 ||
          normalizedTitle.includes("prove your humanity") ||
          normalizedTitle.includes("access denied")
        ) {
          recordedFailure = `${item.documentId} -> status=${status} url=${finalUrl} title=${title || "-"}`;
          continue;
        }

        recordedFailure = null;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recordedFailure = `${item.documentId} -> ${message}`;
        if (!message.includes("ERR_NETWORK_CHANGED")) {
          break;
        }
      } finally {
        await context.close();
      }
    }

    if (recordedFailure) {
      failures.push(recordedFailure);
    }
  }

  expect(failures).toEqual([]);
});

test("detail open button creates a real browser popup for sampled documents", async ({
  page,
}) => {
  await page.goto("/");
  await expect
    .poll(() => page.locator("[data-feed-item-document-id]").count())
    .toBeGreaterThan(0);

  const firstDocumentIds = await getVisibleFirstDocumentIds(page);

  for (const documentId of firstDocumentIds) {
    const button = await waitForByDataAttr(
      page.locator("[data-feed-item-document-id]"),
      "data-feed-item-document-id",
      documentId,
    );
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(
      await waitForByDataAttr(
        page.locator("[data-document-detail-id]"),
        "data-document-detail-id",
        documentId,
      ),
    ).toBeVisible();

    const popupPromise = page.waitForEvent("popup");
    await page.locator('[data-open-reference-link="true"]').click();
    const popup = await popupPromise;
    await expect
      .poll(() => popup.url(), { timeout: 20_000 })
      .not.toBe("about:blank");
    await popup.close();

    await page.getByRole("button", { name: "back to list" }).click();
    await expect
      .poll(() => page.locator("[data-feed-item-document-id]").count())
      .toBeGreaterThan(0);
  }
});

test("quick groups reorder swaps groups when dropping on the target's trailing side", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /manage panels/i })).toBeVisible();

  await page.getByRole("button", { name: /manage panels/i }).click();
  await expect(
    page.getByRole("heading", { name: /Manage Source Panels/i }),
  ).toBeVisible();

  const chips = page.locator("[data-group-chip-label]");
  const handles = page.getByRole("button", { name: /^Reorder /i });

  await expect(handles).toHaveCount(await handles.count());
  const chipCount = await chips.count();
  expect(chipCount).toBeGreaterThanOrEqual(2);

  const before = await chips.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-group-chip-label") || ""),
  );

  const fromHandle = handles.nth(0);
  const targetChip = chips.nth(1);
  const fromBox = await fromHandle.boundingBox();
  const targetBox = await targetChip.boundingBox();

  if (!fromBox || !targetBox) {
    throw new Error("Could not resolve quick group drag positions");
  }

  await page.mouse.move(
    fromBox.x + fromBox.width / 2,
    fromBox.y + fromBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width - 4,
    targetBox.y + targetBox.height / 2,
    { steps: 14 },
  );
  await page.mouse.up();

  await expect
    .poll(async () =>
      chips.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-group-chip-label") || ""),
      ),
    )
    .toEqual([
      before[1],
      before[0],
      ...before.slice(2),
    ]);
});
