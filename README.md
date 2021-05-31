# spotify_classifier

Browse Spotify artists groupped by genre.

Once your Spotify list of artists becomes too large to manage, you can use Spotify classifier to automatically go through the list of your followed artists to create an index groupped by category. The categories will be automatically determined based on the artists you follow. spotify_classifier will offer a simple web page with an index of all the artists you followed, groupped by somewhat logical categories.


## Running

Prerequisite: you'll need to create API keys for your Spotify account at developer.spotify.com. This may only work with paid subscriptions.
NB: Tested in Raspbian, should be easy to adapt to other platforms as long as pip can be installed.

1. Clone this repo: `git clone https://github.com/nicolasbrailo/spotify_classifier.git ~/spotify_classifier`
1. `cd ~/spotify_classifier`
1. Install Python dependencies: `sudo apt-get install python3 && pip3 install pipenv && python3 -m pipenv install requests`
1. Create a new config.json file based on the example. Remember to change your username, and use the client ID, secret and redirect URL from developer.spotify.com. The client ID, secret and redirect URL are, basically, a 3-part-password. If any of these fields don't match your account, then the classifier won't be able to connect. Note the redirect URL doesn't need to be a *working* URL either (ie you can just use http://localhost:1234/ when creating your API keys)
1. Manually run the service to set up your credentials: `python3 -m pipenv run python ./sp.py` - this will ensure the service can connect to Spotify. It may request you to approve the tokens by copy and pasting a URL in the browser, then copying back the URL you are redirected to. If there is any problem with your credentials, you'll find it at this step.
1. The first time the service starts correctly, it will build a cache of your artists. This may take a while. Once it's done you will see a log message from Flask (eg "Running on http://0.0.0.0:1234/"). You can now access the interface in your browser (eg 127.0.0.1:1234)


## Installing as a service

The following installation instructions work in Raspbianm and should be easy to adapt to other Unixy platforms.

1. Open spotify_classifier.service with a text editor and change the paths if needed.
1. Install the systemd service `sudo ln -s ~/spotify_classifier/spotify_classifier.service /etc/systemd/system`
1. Start service: `sudo systemctl daemon-reload && sudo systemctl restart spotify_classifier && sudo sudo systemctl enable spotify_classifier`
1. Check status: `systemctl status spotify_classifier`
1. Tail logs `journalctl -u spotify_classifier -f


## My categories don't make sense!

Spotify classifier doesn't use any clever algorithms to determine the grouppings. In short, it will:

1. Iterate through your artists to find all the genres you listen to.
1. Merge genres that are very similar (eg they share a large % of artists)
1. Merge genres that are small with their closest match

The algorithm isn't particularly smart, and isn't even stable (the result will depend on the order of application of the rules - so you may get different results in different runs!)

For 'small' issues, you may define custom rules in config.json; here you can define a list of subgenres that should be merged to a parent genre. If there is a similarity rule this service doesn't exploit, you may define your own merge rules by extending the GenreMerger class. PRs welcome!


## I want to change how the index looks

The webpage is hardcoded in sp.py as plain HTML. Feel free to submit a PR to split this into a template for easier modification.


