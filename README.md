# spotify_classifier

~Browse Spotify artists groupped by genre.~ Alt web client for Spotify.

Once your Spotify list of artists becomes too large to manage, you can use Spotify classifier to automatically go through the list of your followed artists to create an index groupped by category. The categories will be automatically determined based on the artists you follow. spotify_classifier will offer a simple web page with an index of all the artists you followed, groupped by somewhat logical categories.

~This is a self-hosted service: it requires an API key for Spotify, and you need to host it yourself (ie just run it in your computer).~

You can use this service from https://nicolasbrailo.github.io/sppl - you will need a developer API key+secret. All the storage is local to your browser (there is no key, user data or anything at all being sent to any external host, everything is done in your browser) and you can even use this client offline (Spotify won't work offline, though). You can also self-host this service, either by forking the project or by running it via a local webserver.


## Running locally

Prerequisite: you'll need to create API keys for your Spotify account at developer.spotify.com. This may only work with paid subscriptions.

1. Clone this repo: `git clone https://github.com/nicolasbrailo/spotify_classifier.git ~/spotify_classifier`
1. `cd ~/spotify_classifier`
1. Run `./run.sh`, or alternatively get an http host that can serve the files in this repo
1. Goto localhost:8000 and follow the login process


## My categories don't make sense!

Spotify classifier doesn't use any clever algorithms to determine the grouppings. In short, it will:

1. Iterate through your artists to find all the genres you listen to.
1. Merge genres that are very similar (eg they share a large % of artists)
1. Merge genres that are small with their closest match

The algorithm isn't particularly smart, and isn't even stable (the result will depend on the order of application of the rules - so you may get different results in different runs!)

For 'small' issues, you may define custom rules in config.json; here you can define a list of subgenres that should be merged to a parent genre. If there is a similarity rule this service doesn't exploit, you may define your own merge rules by extending the GenreMerger class. PRs welcome!



