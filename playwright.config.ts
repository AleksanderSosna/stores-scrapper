import { PlaywrightTestConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config();

const config: PlaywrightTestConfig = {
    timeout: 15 * 60 * 1000,
    expect: {
        timeout: 10 * 1000,
        toHaveScreenshot: {
            maxDiffPixelRatio: 0.05,
        },
    },
    testDir: process.env.TEST_DIR ? process.env.TEST_DIR : "./tests",
    outputDir: "./output",
    reporter: process.env.CI === "true" ? "github" : [["line"], ["html"]],
    fullyParallel: true,
    retries: 0,
    forbidOnly: process.env.CI === "true",
    workers: process.env.CI === "true" ? 1 : 1,
    use: {
        actionTimeout: 0,
        headless: process.env.CI === "true" ? true : process.env.HEADLESS === "true",
        locale: "pl-PL",
        timezoneId: "Europe/Warsaw",
        geolocation: { longitude: 19, latitude: 50 },
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        trace: "retain-on-failure",
        // launchOptions: { slowMo: 500 },
    },
    projects: [
        /* desktop */
        {
            name: "Desktop Chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
};

export default config;
