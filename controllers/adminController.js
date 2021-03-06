const LeaderModel = require("../models/leaders_model");
const BookModel = require("../models/books_model");

function adminController() {
    this.bookDataEntry = async function(req, res){

      const admins =process.env.ADMINS.split(' ') 

      if(admins.includes(req.user.twitterId)){
        let book;
        let bookId = req.query.bookId
        if(bookId){
            book = await BookModel.findById({_id: bookId}).sort('-recoCount').lean().catch(err => res.send("error: " + err));
        } else {
            book = await BookModel.findOne({createdBy : {$exists: false}}).sort('-recoCount').lean().catch(err => res.send("error: " + err));
        }
        // console.log(book);

        if (!book.amazonLink.match(/^https\:\/\/www\.amazon\.in/)) book.amazonLink = "";
        if(book){
            // console.log(book, book.bookName);
            res.render(
            process.cwd() + "/views/admin/book-data-entry.ejs",
            { data: book }
            );
        } else {
            res.send("Book not uploaded");
        }
      } else {
        res.redirect('/');
      }
    }
    
    this.leaderDataEntry = async function(req,res){

      const admins =process.env.ADMINS.split(' ') 

      console.log("user: ", req.user);

      if(admins.includes(req.user.twitterHandle)){
        let leader;
        let leaderId = req.query.leaderId
        
        if(leaderId){
            leader = await LeaderModel.findById(leaderId).sort('-sortCount').lean().catch(err => res.send("error: "+ err));
        } else {
            leader = await LeaderModel.findOne({createdBy : {$exists: false}}).sort('-sortCount').lean().catch(err => res.send("error: "+ err));
        }
        // console.log(leader);

        leader.twitter = leader.twitter || {};

        if(leader){
            res.render(
            process.cwd() + "/views/admin/leader-data-entry.ejs",
            { data: leader }
            )
        } else {
            res.send("no leaders available")
        }
      } else {
        res.redirect('/');
      }
    }

    this.updatedBook = async function(req, res) {
        const got = require('got');
        const cheerio = require('cheerio');
      

        let ISBN10="", ISBN13="", ASIN="", bookTags = [], bookImgPath;
    
        let uri = req.body.amazonLink;
        if(uri) {
            let pos = uri.lastIndexOf('/')+1;
            uri = uri.substring(0, pos);
            await got(uri).then(uriRes => {
                let $ = cheerio.load(uriRes.body);
    
                    bookImgPath = $('#img-canvas').find('img').attr('src')
                    
                    const breadCrumbs = $('#wayfinding-breadcrumbs_feature_div a')
                    breadCrumbs.each((i, dat) => {
                      if (i!=0 && i<breadCrumbs.length){
                        bookTags.push($(dat).text().trim());
                      }
                    })
    
                    const elements = $('.content li')
                    elements.each((i, dat) => {
                        
                        let pos = $(dat).text().trim().lastIndexOf(':')+1;
    
                        if ($(dat).find('b').text() == "ISBN-10:"){
                          ISBN10 = $(dat).text().trim().substring(pos).trim(); 
                        }
                        if ($(dat).find('b').text() == "ISBN-13:"){
                          ISBN13 = $(dat).text().trim().substring(pos).trim(); 
                        }
                        if ($(dat).find('b').text() == "ASIN:"){
                          ASIN = $(dat).text().trim().substring(pos).trim(); 
                        }
                    })
            }).catch(err => {
                console.error('scrapeBooksList err: ', err);
            })
        }
    
        let leaderUpdate = await LeaderModel.updateMany({'booksReco.id' : req.body.bookId},{
                                            $set: {
                                              'booksReco.$.ISBN13': ISBN13,
                                              'booksReco.$.ISBN10': ISBN10,
                                              'booksReco.$.ASIN': ASIN
                                            }}).lean();
    
        let newLink = encodeURI((`/books/${ISBN13 || ISBN10 || ASIN || req.body.bookId}/${req.body.bookAuthor.split(',')[0]+" "+req.body.bookName }`).replace(/\s/g, "-"));

        let bookUpdate = await BookModel.findByIdAndUpdate(
                                    {_id: req.body.bookId}, {
                                      $set: {
                                      bookName: req.body.bookName,
                                      bookAuthor: req.body.bookAuthor.split(','),
                                      ISBN13: ISBN13,
                                      ISBN10: ISBN10,
                                      ASIN: ASIN,
                                      bookDesc: req.body.bookDesc,
                                      bookImgPath: bookImgPath,
                                      bookRBLink: newLink,
                                      amazonLink: req.body.amazonLink,
                                      createdBy: req.connection.remoteAddress,
                                      updatedBy: req.connection.remoteAddress
                                    },
                                    $addToSet: {
                                      bookTags: bookTags
                                    }
                                  },
                                    {returnOriginal: false}
                                  ).lean();
        // console.log(book);
        let book = [];
        book.push(bookUpdate);
        res.render(
          process.cwd() + "/views/admin/display-updatedBook.ejs",
          { data: book }
        );
        
    };

    this.updatedLeader = async function(req,res){

        const getUser = require('../twitterAPI/get-user-details.js');
        let twitterDetails = await getUser(req.body.twitter_handle).catch(err => console.log(err));
        console.log(twitterDetails);

        // console.log(req.body);
        let ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  req.connection.socket.remoteAddress;

          
        await BookModel.updateMany({'leadersReco.leaderDbId': req.body.leaderId},{
                                              $set : {
                                                'leadersReco.$.twitterId': twitterDetails.id_str,
                                                'leadersReco.$.twitterHandle': twitterDetails.screen_name.toLowerCase()
                                              }
                                            });
    
        let books = await BookModel.find({'leadersReco.leaderDbId': req.body.leaderId}, 
                                        'bookName bookAuthor ISBN13 ISBN10 ASIN bookTags bookImgPath amazonLink recoCount leadersReco.$')
                                        .sort('-recoCount').lean();
          // {'leadersReco.$' : 1, _id: 0}


        let newLink = encodeURI((`/${twitterDetails.screen_name.toLowerCase() || req.body.leaderId}`));
        let leaderImgPath = req.body.useTwitterImg == "true" ? 
                            twitterDetails.profile_image_url_https.replace("normal", "400x400") :
                            req.body.leaderImgPath;
        
        let leader = await LeaderModel.findByIdAndUpdate(req.body.leaderId, {
                    $set: {
                      leaderName: req.body.leaderName,
                      leaderSector: req.body.leaderSector,
                      leaderBio: req.body.leaderBio,
                      leaderImgPath: leaderImgPath,
                      leaderRBLink: newLink,
                      leaderStoryLink: req.body.leaderStoryLink,
                      useTwitterImg: req.body.useTwitterImg,
                      'twitter.id': twitterDetails.id_str,
                      'twitter.handle': twitterDetails.screen_name.toLowerCase(),
                      'twitter.followers': twitterDetails.followers_count,
                      'twitter.ImgPath' : twitterDetails.profile_image_url_https.replace("normal", "400x400"),
                      sortCount: twitterDetails.followers_count,
                      createdBy: ip,
                      updatedBy: ip
                    }
                  },
                  {returnOriginal: false}).lean();
    
        // console.log(leader);
    
        if(leader.booksReco.length != books.length){
          console.log("Book Count mismatch", leader);
        }
    
        let data = {leader, books};
    
        res.render(
          process.cwd() + "/views/admin/display-updatedLeader.ejs",
          { data: data }
        );
    }
}

module.exports = adminController;