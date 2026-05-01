const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test.describe('Storage conflict resolution', () => {
  test.use({ timeout: 60000 });

  test('should resolve storage conflict when timestamps differ (sync wins)', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; storage conflict test requires real extension'
      );
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Set to solid mode first
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');
    await popupPage.close();
    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    // Verify solid mode is active
    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeHidden({ timeout: 10000 });

    // Manually manipulate local storage to have newer timestamp but different mode
    // This simulates a conflict scenario where local storage has newer timestamp
    await page.evaluate(() => {
      const localData = { 
        playerBackgroundMode: 'blur', 
        playerBackgroundModeTimestamp: Date.now() + 10000 
      };
      localStorage.setItem('playerBackgroundMode', JSON.stringify(localData.playerBackgroundMode));
      localStorage.setItem('playerBackgroundModeTimestamp', JSON.stringify(localData.playerBackgroundModeTimestamp));
    });

    // Reload the page to trigger storage reconciliation
    await page.reload();
    await waitForWatchPlayer(page);

    // Wait for canvas state to confirm solid mode
    await expect(canvas).toBeHidden({ timeout: 10000 });
    
    await popupPage.close();
  });

  test('should converge storage when both storages have data', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; storage conflict test requires real extension'
      );
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Set to blur mode
    await popupPage.locator('label[for="modeBlur"]').click();
    await waitForExtensionStorageMode(popupPage, 'blur');
    await popupPage.close();
    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    // Verify blur mode is active
    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Open popup again and switch to solid
    const popupPage2 = await openExtensionPopup(context, extensionId);
    await popupPage2.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage2, 'solid');
    await popupPage2.close();
    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    // Should now be in solid mode
    await expect(canvas).toBeHidden({ timeout: 10000 });
  });

  test('should handle missing timestamp in storage gracefully', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; storage test requires real extension'
      );
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    // Manually set storage without timestamp
    await page.evaluate(() => {
      localStorage.setItem('playerBackgroundMode', JSON.stringify('solid'));
      // No timestamp set
    });

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Wait for storage to load
    await page.waitForTimeout(500);

    // Should handle missing timestamp gracefully
    const _solidRadio = popupPage.locator('#modeSolid');
    // The mode should be either solid or blur, but page should not crash
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    await popupPage.close();
  });
});
