import { Show } from "solid-js";

import { Trans } from "@lingui/solid/macro";

import {
  DAWNCHAT_WEBMAIL_URL,
  EMAIL_PROVIDER_URLS,
} from "@revolt/common/lib/links";
import { Button } from "@revolt/ui";

interface Props {
  email?: string;
}

/**
 * Convert email to provider
 * @param email Email
 * @returns Provider
 */
function mapMailProvider(email?: string): [string, string] | undefined {
  if (!email) return;

  const match = /@(.+)/.exec(email);
  if (match === null) return;

  const domain = match[1];
  switch (domain) {
    case "gmail.com":
    case "googlemail.com":
      return ["Gmail", EMAIL_PROVIDER_URLS.gmail];
    case "tuta.io":
      return ["Tutanota", EMAIL_PROVIDER_URLS.tutanota];
    case "outlook.com":
    case "hotmail.com":
    case "outlook.jp":
    case "outlook.fr":
    case "outlook.dk":
    case "outlook.com.ar":
    case "outlook.com.au":
    case "outlook.at":
    case "outlook.be":
    case "outlook.com.br":
    case "outlook.cl":
    case "outlook.cz":
    case "outlook.com.gr":
    case "outlook.co.il":
    case "outlook.in":
    case "outlook.co.id":
    case "outlook.ie":
    case "outlook.it":
    case "outlook.hu":
    case "outlook.kr":
    case "outlook.lv":
    case "outlook.my":
    case "outlook.co.nz":
    case "outlook.com.pe":
    case "outlook.ph":
    case "outlook.pt":
    case "outlook.sa":
    case "outlook.sg":
    case "outlook.sk":
    case "outlook.es":
    case "outlook.co.th":
    case "outlook.com.tr":
    case "outlook.com.vn":
      return ["Outlook", EMAIL_PROVIDER_URLS.outlook];
    case "yahoo.com":
      return ["Yahoo", EMAIL_PROVIDER_URLS.yahoo];
    case "wp.pl":
      return ["WP Poczta", EMAIL_PROVIDER_URLS.wp];
    case "protonmail.com":
    case "protonmail.ch":
    case "pm.me":
      return ["ProtonMail", EMAIL_PROVIDER_URLS.protonmail];
    case "seznam.cz":
    case "email.cz":
    case "post.cz":
      return ["Seznam", EMAIL_PROVIDER_URLS.seznam];
    case "zoho.com":
      return ["Zoho Mail", EMAIL_PROVIDER_URLS.zoho];
    case "aol.com":
    case "aim.com":
      return ["AOL Mail", EMAIL_PROVIDER_URLS.aol];
    case "icloud.com":
      return ["iCloud Mail", EMAIL_PROVIDER_URLS.icloud];
    case "mail.com":
    case "email.com":
      return ["mail.com", EMAIL_PROVIDER_URLS.mail];
    case "yandex.ru":
    case "yandex.by":
    case "yandex.ua":
    case "yandex.com":
      return ["Yandex Mail", EMAIL_PROVIDER_URLS.yandex];
    case "hey.com":
      return ["HEY", EMAIL_PROVIDER_URLS.hey];
    case "mail.ru":
    case "bk.ru":
    case "inbox.ru":
    case "list.ru":
    case "internet.ru":
      return ["Mail.ru", EMAIL_PROVIDER_URLS.mailRu];
    case "rambler.ru":
    case "lenta.ru":
    case "autorambler.ru":
    case "myrambler.ru":
    case "ro.ru":
    case "rambler.ua":
      return ["Rambler", EMAIL_PROVIDER_URLS.rambler];
    case "creatorplaza.nl":
    case "dawn-chat.com":
    case "chillboiostudios.com":
      return ["DawnChat Mail", DAWNCHAT_WEBMAIL_URL];
    default:
      return [domain, `https://${domain}`];
  }
}

/**
 * Provide button to navigate to email provider
 */
export function MailProvider(props: Props) {
  /**
   * Convert email to provider
   * @returns Provider
   */
  const provider = () => mapMailProvider(props.email);

  return (
    <Show when={provider()}>
      <a href={provider()![1]} target="_blank" rel="noreferrer">
        <Button>
          <Trans>Open {provider()![0]}</Trans>
        </Button>
      </a>
    </Show>
  );
}
