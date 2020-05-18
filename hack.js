const express = require('express');
const app = express();
const serv = require('http').Server(app);
const io = require('socket.io')(serv, {});
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors')

serv.listen(process.env.port || 3000);

app.use(cors())

app.get('*', function(req, res) {
    res.sendFile(__dirname + './public/index.html');
});
app.use('./public', express.static(__dirname + './public'));

const sort_cards = cards => {
    cards.sort(function (a, b) {
        let ta = a.prompt.toUpperCase()
        let tb = b.prompt.toUpperCase()
        if (ta < tb) return -1
        if (ta > tb) return 1
        return 0
    })
    return cards
}

io.sockets.on('connection', socket => {
    console.log('client connected', socket.id);

    let get_cards = async (topic, sort_state, unique_state) => {
        let total_sets = 0
        let cards = []
        let c_list = []
        let p_list = []
        let unique_cnt = 0

        let topic_url = `https://quizlet.com/subject/` + topic.replace(/ /g, '-') + `/?price=free&type=sets&creator=all`
        
        await axios.get(topic_url).then(async response => {
            const $ = cheerio.load(response.data)
            let sets = $('.UILinkBox-link')
            if (sets.length < 1) {
                socket.emit('cards_update', {
                    cards: [],
                    set_count: 0
                })
            }

            for (let i = 0; i < sets.length; i++) {
                let set_url = sets[i].children[0].attribs.href

                await axios.get(set_url).then(async response => {
                    total_sets++
                    const $ = cheerio.load(response.data)
                    let terms = $('.SetPageTerm-wordText')
                    let definitions = $('.SetPageTerm-definitionText')

                    for (let j = 0; j < terms.length; j++) {
                        try {
                            let p = terms[j].children[0].children[0].data
                            let a = definitions[j].children[0].children[0].data
                            if (!c_list.includes(p + a) && p && a){
                                let unique = !p_list.includes(p.toUpperCase())
                                if (unique) unique_cnt++
                                let display = true
                                if (unique_state) display = unique
                                cards.push(
                                    {
                                        id: shortid.generate(),
                                        prompt: p,
                                        answer: a,
                                        unique: unique,
                                        display: display,
                                        search_phrase: true
                                    }
                                )
                                c_list.push(p + a)
                                p_list.push(p.toUpperCase())
                            }
                        } catch (error) {}

                    }
                }), (error) => {
                    console.log('error fetching', set_url);
                };

            }
        }), (error) => {
            console.log('error fetching', topic_url);
        };

        let card_count = cards.length
        if (unique_state) card_count = unique_cnt
      
        let unsorted_cards = _.clone(cards)
        let sorted_cards = sort_cards(_.clone(cards))
        if (sort_state) cards = sorted_cards

        socket.emit('cards_update', {
            cards: cards,
            card_count: card_count,
            sorted_cards: sorted_cards,
            unsorted_cards: unsorted_cards,
            set_count: total_sets
        })

    }

    socket.on('requesting_cards', data => {
        console.log('fetching cards for', data.topic)
        get_cards(data.topic, data.sorted, data.unique)
    });

    socket.on("disconnect", () => {
        console.log("client disconnected", socket.id);
    });
})