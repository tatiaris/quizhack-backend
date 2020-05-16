const express = require('express');
const app = express();
const serv = require('http').Server(app);
const io = require('socket.io')(serv, {});
const axios = require('axios');
const cheerio = require('cheerio');
const shortid = require('shortid');

serv.listen(3000);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/public/build/index.html');
});
app.use('/public/build/', express.static(__dirname + '/public/build/'));


io.sockets.on('connection', socket => {
    console.log('client connected');

    let get_cards = topic => {
        let cards = []

        let topic_url = `https://quizlet.com/subject/` + topic.replace(/ /g, '-') + `/?price=free&type=sets&creator=all`
        
        axios.get(topic_url).then(response => {
            const $ = cheerio.load(response.data)
            let sets = $('.UILinkBox-link')
            console.log('found', sets.length, 'sets')
            if (sets.length < 1) {
                socket.emit('cards_update', {
                    cards: [],
                    set_count: 0
                })
            }

            for (let i = 0; i < sets.length; i++) {
                let set_url = sets[i].children[0].attribs.href
                // console.log('getting data from', set_url)

                axios.get(set_url).then(response => {
                    const $ = cheerio.load(response.data)
                    let terms = $('.SetPageTerm-wordText')
                    let definitions = $('.SetPageTerm-definitionText')

                    for (let j = 0; j < terms.length; j++) {
                        try {
                            cards.push(
                                {
                                    id: shortid.generate(),
                                    prompt: terms[j].children[0].children[0].data,
                                    answer: definitions[j].children[0].children[0].data
                                }
                            )
                        } catch (error) {}
                        
                        if (i == sets.length - 1 && j == terms.length - 1) {
                            socket.emit('cards_update', {
                                cards: cards,
                                set_count: sets.length
                            })
                        }
                    }
                }), (error) => {
                    console.log('error fetching', set_url);
                };

            }
        }), (error) => {
            console.log('error fetching', topic_url);
        };

    }

    socket.on('requesting_cards', data => {
        console.log('fetching cards for', data.topic)
        get_cards(data.topic)
    });

    socket.on("disconnect", () => {
        console.log("client disconnected");
    });
})