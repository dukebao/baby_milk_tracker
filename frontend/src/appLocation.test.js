const originalPublicUrl = process.env.PUBLIC_URL;
afterEach(() => {
  if (originalPublicUrl === undefined) delete process.env.PUBLIC_URL;
  else process.env.PUBLIC_URL = originalPublicUrl;
  window.history.replaceState({}, "", "/");
});
function locationHelpers(publicUrl) {
  process.env.PUBLIC_URL = publicUrl;
  let helpers;
  jest.isolateModules(() => { helpers = require("./appLocation"); });
  return helpers;
}
test("development invite URLs use the local origin", () => {
  const { appBasePath, appUrl } = locationHelpers("");
  expect(appBasePath).toBe("");
  expect(appUrl("/join/token")).toBe(`${window.location.origin}/join/token`);
});
test("Pages invites include the repository path and remain identifiable for onboarding", () => {
  const { appBasePath, appUrl, isInviteLocation } = locationHelpers("/baby_milk_tracker");
  expect(appBasePath).toBe("/baby_milk_tracker");
  expect(appUrl("/join/token")).toBe(`${window.location.origin}/baby_milk_tracker/join/token`);
  window.history.replaceState({}, "", "/baby_milk_tracker/join/token");
  expect(isInviteLocation()).toBe(true);
  window.history.replaceState({}, "", "/baby_milk_tracker/milk_track/2026-10-03");
  expect(isInviteLocation()).toBe(false);
});
test("an absolute Pages URL and trailing slash produce the same base path", () => {
  const { appBasePath, appUrl } = locationHelpers("https://dukebao.github.io/baby_milk_tracker/");
  expect(appBasePath).toBe("/baby_milk_tracker");
  expect(appUrl("join/token")).toBe(`${window.location.origin}/baby_milk_tracker/join/token`);
});
