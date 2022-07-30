class Game {
  constructor(config = {}) {//we are declaring the config variable here
    this.phaserConfig = {
      type: Phaser.AUTO, //it allows the browser to decide whether we should use canvas or web gui
      parent: config.id,
      width: config.width ? config.width : 800,//it grabs from the config rather than us specifying it explicitly(its a tirnary operator)
      height: config.height ? config.height : 600,
      scene: {
        key:"default",
        init: this.initScene, //initialization step: to initialize variables
        create: this.createScene,//we create graphics,etc
        update: this.updateScene,//constantly rendering things on screen
      }
    }
    this.client = stitch.Stitch.initializeDefaultAppClient(config.realmAppId);//mongodb connection
    this.database = this.client.getServiceClient(stitch.RemoteMongoClient.factory, "mongodb-atlas").db(config.databaseName);
    this.collection = this.database.collection(config.collectionName);
  }

  initScene(data) {// we add data to accept the obj named this.game.scene.start
    this.isDrawing = false;//it should not be drawing at this scene
    this.collection=data.collection;//so when we write this.collection now it will consider data.collection not the obj of the class Game
    this.gameId = data.gameId;
    this.authId = data.authId;
    this.ownerId = data.ownerId;
    this.strokes = data.strokes;
  }
  async createScene() {//set somethings before the game begins like graphics and line size, color,etc
    this.graphics = this.add.graphics();
    this.graphics.lineStyle(4, 0x0025aa31);
    this.strokes.forEach(stroke =>{//this will retain the drawing even after you refresh the screen
      this.path=new Phaser.Curves.Path();
      this.path.fromJSON(stroke);
      this.path.draw(this.graphics);
    });
    const stream = await this.collection.watch({
      "fullDocument._id":this.gameId
    });
    stream.onNext(event =>{
      console.log(event);
      let updatedFields=event.updateDescription.updatedFields;
      //// if(updatedFields.hasOwnProperty("strokes")){
      ////   updatedFields=[updatedFields.strokes["0"]];
      ////  }
      for(let strokeWithNumber in updatedFields){
        let changeStreamPath = new Phaser.Curves.Path();
        changeStreamPath.fromJSON(updatedFields[strokeWithNumber]);
        changeStreamPath.draw(this.graphics);
      }
    });
  }
  updateScene() {//this continuously runs in our game
    //are we drawing or not is determined here(if else==>drawing or not)
    //// if(this.authId==this.ownerId){
    if (!this.input.activePointer.isDown && this.isDrawing) { //active pointer means mouse is pressing or pen is pressing on the screen
      //if we are not draing ==> dont show anything on the screen (ie, false)
      this.collection.updateOne(// its a promise in js
        {
          "_id":this.gameId,
          "owner_id":this.authId
        },
        {
          "$push":{
            "strokes":this.path.toJSON()
          }
        }
      ).then(result=> console.log(result), error =>console.error(error));
      this.isDrawing = false;//rather than connecting dots to form a line, this function make sure it captures a line
    } else if (this.input.activePointer.isDown) {
      //if else under this is ==> if(its the initial point to draw a line) or else(its just a continuity of a line)//this is to prevent merging two lines into one ,i.e, when a line is drawn and the pen is lift then again starts g=draing a line ==> it should not merge the two lines
      if (!this.isDrawing) {//when we have just started drawing
        this.path = new Phaser.Curves.Path(//initial point of the line(instantiate the path here)
        //it also coordinates the cursor here
          this.input.activePointer.position.x - 2,//x position of the curser(-2 is because the thickness of line is 4)
          this.input.activePointer.position.y - 2// y position of curser
        );
        this.isDrawing = true;//we are drawing here
      } else {//if its not an initial line and the line is already drawing 
        this.path.lineTo(
          this.input.activePointer.position.x - 2,
          this.input.activePointer.position.y - 2
        );
      }
      this.path.draw(this.graphics);//createScreen's this.graphics reference // this is the actiual drawing happens
    }
  }
//// }
//async==>interact with database, its a js promise (async means asynchronous)
  async authenticate() {//this is going to return an anonynous authentication against realm because we are not using accounts of the players
    return this.client.auth.loginWithCredential(
      new stitch.AnonymousCredential()//as we trust the other player hence its anonymous authentication
    );
  }
  async createOrJoin(id) {//this is to create a new game or join a game
    //this is a wrapper function we are creating to avoid writing promise, as createGame function is asynchronous
    try{
    let auth = await this.authenticate();//if a id already exists, then dont create a new id ...continue as the old game
    //console.log(auth);//when we inspect the localhost page on net, in console under e under auth , we get the id , that random no. id will be assigned here in the next line's auth.id variable
    let result=await this.joinGame(id,auth.id);
    if(result==null){
    result = this.createGame(id, auth.id);//if there is no id running...create a new game with a new name and is
    }
    return result;
  }catch(e){
      console.error(e);
    }
  }
async joinGame(id,authId){
  try{
    let result= await this.collection.findOne({"_id": id})
    if(result!=null){//if result==NULL
      this.game = new Phaser.Game(this.phaserConfig);//start the game(to get the black screen)//like a start scene
      //so basically we do the insert,ie, we get the id and all and then we start the game in this.game
      this.game.scene.start("default",{
        "gameId":id,
        "collection":this.collection,
        "authId":authId,
        "ownerId":result.owner_id,
        "strokes":result.strokes
      });
    }
    return result;
  }catch(e){
    console.error(e);
  }
}

  //createGame(id,authId)// id is like the players name entered ex:kruti
  async createGame(id, authId) {//instead of putting it in the constructor we created a separate function to it
    try{
      let game=await this.collection.insertOne({//this.collection from the constructor is used here
        "_id":id,
        "owner_id":authId,
        "strokes":[]//the json data created in updateScene's Phaser.Curve.Path will be converted to stroke object/array here
      });
      this.game = new Phaser.Game(this.phaserConfig);//start the game(to get the black screen)//like a start scene
      //so basically we do the insert,ie, we get the id and all and then we start the game in this.game
      this.game.scene.start("default",{
        "gameId":id,
        "collection":this.collection,
        "authId":authId,
        "ownerId":authId,
        "strokes":[]
      });
    }
    catch(e){
      console.error(e);
    }
    
  }
}
