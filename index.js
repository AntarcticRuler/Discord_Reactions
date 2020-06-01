// NICKSTUDIOS
// - AntarcticRuler

const Discord = require("discord.js");
const assert = require ('assert');

const fs = require ('fs')

var client = new Discord.Client();

var config = require ('./config.json');

const token = config.token;

const MongoClient = require("mongodb").MongoClient;

const express = require('express')
const app = express()
const port = 3000
app.use(express.json());

const DiscordOauth2 = require("discord-oauth2");
const oauth = new DiscordOauth2();

var DiscordStrategy = require('passport-discord').Strategy;
var passport = require('passport');
app.use(passport.initialize());

var a_token;

var server_reactions;

const kurisu_red = "#592929"

const recent_reactions = new Set();

// Returns a random String of characters, used for the random_token variable
var rand = function() { return Math.random().toString(36).substr(2); };

passport.use(new DiscordStrategy(
  {
    clientID: '688388524528893955',
    clientSecret: config.o2auth_secret,
    callbackURL: `http://www.nick-studios.com/rxns/auth/callback`,
    scope: ["identify", "guilds"],
  },
  function(accessToken, refreshToken, profile, cb) {
  
    let data = []; // the data for all the partial guilds
    // let rxnsExisting = []; // the already existing servers

    a_token = accessToken; // the access token
    // gets all the users guilds
    oauth.getUserGuilds(accessToken).then(guilds => { 

      // loops through all the users guilds
      guilds.forEach(element => {
        // sees if the user owns the guild
        if (element.owner)
          data.push(element);
          // collection.findOne ( { id : element.id }, function(err, res) { rxnsExisting.push(res) } ) // pushes the already existing reactions
        
      })
      // The route to retreive server_reactions
      app.get('/rxns/server_reactions', function (req, res) {
        res.json(server_reactions)
        res.end();
      })     

      // Gets the Discord user
      oauth.getUser(accessToken).then(user => { 
        // return callback
        return cb( false, { data: data, disc_user: user } );
      })

    });
  })
);

// Im not 100% sure how this does it, but from what google tells me it creates a user-only session
passport.serializeUser(function(user, done) {
  // console.log (user);
  done(null, user);
});
passport.deserializeUser(function(user, done) {
  // console.log (user);
  done(null, user);
});

// Authenticates them
app.get('/rxns/auth', passport.authenticate('discord'));

// The callback for the authentication
// Creates the user-specific routes
app.get(`/rxns/auth/callback`, passport.authenticate('discord', {
  failureRedirect: `http://www.nick-studios.com/rxns`
}), function(req, res) {

  let random_token = rand() + rand(); // Creates a user-specific random token

  let user = req.user; // The user with the data for the user as well as the user ID

  // Creates the routes for data (with a random session/user token)
  app.get(`/rxns/${random_token}/data`, function (req, res) {
    res.json(user.data)
    res.end();
  })
  app.get(`/rxns/${random_token}/user`, function (req, res) {
    res.json(user.disc_user)
    res.end();
  })     
  // Adds a reaction to a server (with a random session/user token)
  app.post (`/rxns/${random_token}/add`, function (req, res) {
    addOne(req.body.server, req.body.name, req.body.url);
    res.end();
  })
  // Deletes a reaction from a server (with a random session/user token)
  app.post (`/rxns/${random_token}/delete`, function (req, res) {
    deleteOne(req.body.server, req.body.name, req.body.reaction);
    res.end();
  })

  res.redirect(`http://www.nick-studios.com/rxns?token=${random_token}`) // Successful auth with the random_token
  res.end();
});

const url = config.uri;
const dbClient = new MongoClient(url, { useUnifiedTopology: true });

var db;
var collection;

// READY
client.on("ready", () => {
  console.log("BOT ON");
  dbClient.connect(function(err) {
    assert.equal(null, err);
    console.log("DB ACTIVE");

    db = dbClient.db("Reactions");
    
    collection = db.collection("reactions");

    client.user.setActivity(`*help`);

    app.listen(port, (req,res) => { 
      console.log(`${client.user.tag} listening on port ${port}!`)
    })

    bot_data();

    collection.find ({}).toArray(function(err, res) {
      server_reactions = res;
      run ();
    });

    remind();

  });
});

function bot_data () {
  // The bot_data res that gets all the relevant info for the bot
  app.get('/rxns/bot_data', function (req, res) {
    res.json({ 
      guild_count: client.guilds.size,
      user_count: client.users.size,
      server_reactions_size: getReactionCount()
    })
    res.end();
  })
}

// Gets the count of all existing reactions
function getReactionCount () {
  count = 0;
  server_reactions.forEach (server => count += Object.entries(server.reactions).length) 
  return count;
}

// Adds a reaction to a server
function addOne (serverID, name, url) {

  console.log (`ADDING ${name}:${url} TO ${serverID}`);

  // Finds the server to add the reaction to
  collection.find( { id: serverID.toString() }).toArray(function(err, res) {
    if (err) throw err;
    // Inserts the guild

    // Adds the reaction
    res[0].reactions[name] = url

    // Updates the server on the DB
    collection.updateOne( { id: serverID } , { $set: { reactions: res[0].reactions } } , function(err, res) {
        if (err) throw err;

        // Updates the server_reactions on the server
        collection.find ({}).toArray(function(err, res) {
          server_reactions = res;
        });
    });
  });
}

// Deletes a reaction to a server
function deleteOne (serverID, name) {

  console.log (`DELETING ${name} FROM ${serverID}`);

  // Finds the server to add the reaction to
  collection.find( { id: serverID.toString() }).toArray(function(err, res) {
    if (err) throw err;

    // Adds the reaction
    delete res[0].reactions[name];

    // Updates the server on the DB
    collection.updateOne( { id: serverID } , { $set: { reactions: res[0].reactions } } , function(err, res) {
        if (err) throw err;

        // Updates the server_reactions on the server
        collection.find ({}).toArray(function(err, res) {
          server_reactions = res;
        });
    });
  });
}

// SENDS REMINDERS TO ALL PEOPLE
function remind () {
  setInterval(() => {
    // Gets reminders.json
    fs.readFile('/home/pi/rxns/reminders.json', function (err, data) {
      var json = JSON.parse(data);
      // Loops through each person
      json.people.forEach (person => {
        if (client.users.cache != undefined)
          client.users.cache.get(person).send (new Discord.RichEmbed ().setDescription('Your friendly reminder to vote for me at \nhttps://top.gg/bot/688388524528893955')).catch (err => console.error(`COULD NOT SEND REMINDER MESSAGE\n${err}`));
        else if (client.users.get (person))
          client.users.get(person).send (new Discord.RichEmbed ().setDescription('Your friendly reminder to vote for me at \nhttps://top.gg/bot/688388524528893955')).catch (err => console.error(`COULD NOT SEND REMINDER MESSAGE\n${err}`));
      })
    });
  }, 12 * 60 * 60 * 1000);
}

function run () {

  // GUILD CREATE
  client.on ("guildCreate", guild => {

    // Creates the GUILD value
    let server = {
      id: guild.id,
      reactions: new Map()
    }

    // Inserts the guild
    collection.insertOne(server, function(err, res) {
        if (err) throw err;
        console.log(`GUILD ${guild.name} ADDED`);

        collection.find ({}).toArray(function(err, res) {
          server_reactions = res;
        });

    });

  });

  // GUILD DELETE
  client.on ("guildDelete", guild => {
    // Deletes the guild when the bot leaves
    collection.deleteOne ({ id: guild.id }, function(err, res) {
      if (err) throw err;
      console.log(`GUILD ${guild.name} DELETED`);
    });
  });


  // MESSAGE
  const prefix = "*";
  client.on("message", message => {
    if (message.author.bot) return;

    // Variables
    let msg = message.content.toLowerCase();

    // The help command
    if (msg.startsWith(`${prefix}help`)) {
      let embed = new Discord.RichEmbed().setDescription(`
      **I'm a good bot!**\n
      All commands for RXNS are handled on the website:\n
      http://www.nick-studios.com/rxns\n
      The only Discord command is *nickname [bot nickname]\n
      Any issues can be sent to AntarcticRuler#1529
      `).setColor (kurisu_red);
      // Checks to see if the bot can send messages in the channel, if not it DMs the help message
      if (message.channel.permissionsFor(message.guild.member(client.user.id)).has('SEND_MESSAGES'))
        message.channel.send (embed).catch (err => console.error(`COULD NOT SEND HELP MESSAGE\n${err}`));
      else
        message.author.send (embed).catch (err => console.error(`COULD NOT SEND HELP MESSAGE\n${err}`));
    }

    // Changes the bot's username
    if (msg.startsWith(`${prefix}nick`) || msg.startsWith(`${prefix}nickname`)) {
      if (message.member.permissions.has('MANAGE_NICKNAMES') && message.guild.member(client.user.id).hasPermission('CHANGE_NICKNAME')) {
        if (msg.split(' ')[1]) {
          message.guild.member(client.user.id).setNickname(message.content.slice(msg.split(' ')[0].length));
          message.channel.send (new Discord.RichEmbed().setDescription('Username changed!').setColor(kurisu_red)).catch (err => console.error(`COULD NOT SEND NICKNAME MESSAGE\n${err}`))
        }
        else
          message.channel.send (new Discord.RichEmbed().setDescription('Please enter a nickname!').setColor(kurisu_red)).catch (err => console.error(`COULD NOT SEND NICKNAME MESSAGE\n${err}`))
      }
      else if (!message.member.hasPermission('MANAGE_NICKNAMES'))
        message.channel.send (new Discord.RichEmbed().setDescription('You do not have manage nicknames permission!').setColor(kurisu_red)).catch (err => console.error(`COULD NOT SEND NICKNAME MESSAGE\n${err}`))
      else
        message.channel.send (new Discord.RichEmbed().setDescription('Error: The bot may not have nickname changing permissions!').setColor(kurisu_red)).catch (err => console.error(`COULD NOT SEND NICKNAME MESSAGE\n${err}`))
    }

    // Voting Reminder
    if (msg.startsWith(`${prefix}vote`)) {
      message.channel.send (new Discord.RichEmbed ().setDescription('Sending reminders for voting for \nhttps://top.gg/bot/688388524528893955\nEvery 12 hours!')).catch (console.error(`COULD NOT SEND VOTING MESSAGE\n${err}`))

      // For some reaosn, FS only wants to work from the root directory. Likely because its running under PM2
      fs.readFile('/home/pi/rxns/reminders.json', function (err, json_data) {
        var json = JSON.parse(json_data)
        let flag = false; // Flags whether the person is in the JSON file or not
        json.people.forEach (person => {
          if (person == "198504755016892416")
            flag = true;
        })
        if (!flag){
            json.people.push("198504755016892416")
            fs.writeFile("/home/pi/rxns/reminders.json", JSON.stringify(json), (error) => { console.log (error) })
        }
      })
    }

    // The meat of the code: for every server it checks if there is an applicable reaction to be sent :)
    /* CAVEATS:
        - Only responds 75% of the time
        - Only responds up to 3 reactions
        - Will have a cool-down for specific reactions of 0.5 seconds to 15.5 seconds
    */
    if (server_reactions == null || server_reactions == undefined)
      return;
    
    server_reactions.forEach ( server => {
      if (server.id == message.guild.id)
        Object.entries(server.reactions).forEach ( reaction => {
          let reaction_count = 0;
          if (msg.includes (reaction[0]) && !recent_reactions.has (reaction[0]) && random_chance() && reaction_count <= 3) {
            message.channel.send (reaction[1]).catch (err => console.error (`COULD NOT SEND MESSAGE\n${err}`));
            recent_reactions.add (reaction[0]); // Adds to cooldown
            setTimeout(() => { // Removes from cooldown
              recent_reactions.delete(reaction[0])
            }, Math.floor (Math.random() * 15000 + 500));
            reaction_count++;
          }
        })
    })

  });

}

// Returns a true or false if above or below 75%
function random_chance () {
  return Math.random () * 10 < 6.5;
}

client.login(token);