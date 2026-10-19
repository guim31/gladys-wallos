# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

The integration holds the API key of a Wallos user, which gives access to every subscription of that
user. Gladys stores it with the configuration and passes it to the container; the integration only sends
it to the address of Wallos given in the configuration, in the body of POST requests to the read
endpoints of the API (never in a URL), and never writes it to `/data` or to the logs. Under `/data`, it
keeps which payment reminders were sent (identifiers and dates, no amount or name). It talks to Wallos
only, on the network of the user; certificate checks are skipped only when "Accept a self-signed
certificate" is enabled.

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to.
