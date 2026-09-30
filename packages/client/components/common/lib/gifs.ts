import { MessageEmbed, WebsiteEmbed } from "stoat.js";
import { GIFBOX_ORIGIN, GIF_PROVIDER_ORIGINS } from "./links";

/**
 * Full origins of gif providers allowed to embed.
 */
/**
 * Check the giffyness of an embed
 *
 * @param embed MessageEmbed to check for giffyness
 * @returns Whether embed is a gif
 */
export function isGif(embed: MessageEmbed) {
  if (embed.type === "Website") {
    const webEmbed = embed as WebsiteEmbed;
    if (webEmbed.specialContent?.type === "GIF") {
      return true;
    }
    const chosenURL = webEmbed.originalUrl || webEmbed.url;
    if (chosenURL) {
      const origin = new URL(chosenURL).origin;
      return GIF_PROVIDER_ORIGINS.some((provider) => provider === origin);
    }
  }

  if (embed.type === "Image" || embed.type === "Video") {
    const embedWithURL = embed as { url?: string };
    if (embedWithURL.url) {
      const origin = new URL(embedWithURL.url).origin;
      return GIF_PROVIDER_ORIGINS.some((provider) => provider === origin);
    }
  }
  return false;
}

export function isGifBox(embed: MessageEmbed) {
  if (embed.type === "Website") {
    const webEmbed = embed as WebsiteEmbed;
    const chosenURL = webEmbed.originalUrl || webEmbed.url;
    if (chosenURL) {
      return new URL(chosenURL).origin === GIFBOX_ORIGIN;
    }
  }

  if (embed.type === "Image" || embed.type === "Video") {
    const embedWithURL = embed as { url?: string };
    if (embedWithURL.url)
      return new URL(embedWithURL.url).origin === GIFBOX_ORIGIN;
  }
  return false;
}
