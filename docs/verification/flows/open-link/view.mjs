export const title = "Open an Envelope link";
const screens = {
  loading: "Envelope loading",
  reading: "Opener reading the link",
  invalid: "Not a valid Envelope link",
  password: "Asking for the link password",
  resolving: "Fetching and verifying the napplet",
  failed: "Napplet could not open",
  running: "Napplet running with its state",
  elsewhere: "Left the napplet, state not sent",
};
export const state = (v) => screens[v.screen];
const steps = {
  OpenerReads: "the opener napplet starts",
  BadLink: "the link does not decode",
  NeedsPassword: "the link is encrypted",
  WrongPassword: "you enter a wrong password",
  RightPassword: "you enter the password",
  PublicLink: "the link is public",
  NotVerified: "the napplet is missing or fails verification",
  TargetReady: "the verified napplet loads",
  FollowLink: "you follow a link inside the napplet",
};
export const step = (action) => steps[action] ?? null;
export const group = (v) =>
  ["running", "elsewhere"].includes(v.screen) ? "open"
  : ["invalid", "failed"].includes(v.screen) ? "stopped" : "working";
export const colors = { open: "teal", stopped: "orange", working: "blue" };
