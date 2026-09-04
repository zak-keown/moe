function attachCookies({ getPageSession }) {
  async function clearCookies(tabIndexOrWsUrl) {
    const ps = await getPageSession(tabIndexOrWsUrl);
    await ps.send('Network.clearBrowserCookies', {});
  }

  return { clearCookies };
}

export { attachCookies };
