import express, { Application } from "express";
import { Server as SocketIOServer, Socket } from "socket.io";
import { createServer, Server as HTTPServer } from "http";
const path = require("path");

interface User {
   name: string;
   socket: Socket;
   key: string;
}

export class Server {
   private httpServer?: HTTPServer;
   private app?: Application;
   private io?: SocketIOServer;

   private bob?: User;
   private alice?: User;

   private readonly DEFAULT_PORT = 6789;

   constructor() {
      this.initialize();

      this.handleRoutes();
      this.handleSocketConnection();
   }

   public listen(callback: (port: number) => void): void {
      if (this.httpServer) this.httpServer.listen(this.DEFAULT_PORT, () => callback(this.DEFAULT_PORT));
   }

   //#region Initialization

   private initialize(): void {
      this.app = express();
      this.httpServer = createServer(this.app);
      this.io = new SocketIOServer(this.httpServer);

      this.configureApp();
      this.handleSocketConnection();
   }

   private handleRoutes(): void {
      if (this.app)
         this.app.get("/", (req, res) => {
            res.redirect("/index");
         });
   }

   /** Middleware that checks if two users are already connected and doesn't let new user's onto the site if that is the case. */
   private ruleOfTwo(req: express.Request, res: express.Response, next: express.NextFunction): void {
      if (this.bob && this.alice) {
         res.redirect("/ruleOfTwo");
      } else {
         next();
      }
   }

   /** Add necessary middleware to the app
    *
    * 1. (`static`) -> Serve static html from public folder.
    * 2. (`ruleOfTwo`) -> Check if two users are already connected and don't let any more in.
    * */
   private configureApp(): void {
      this.app?.use("/index", this.ruleOfTwo.bind(this));
      this.app?.use("/ruleOfTwo", (req: express.Request, res: express.Response, next: express.NextFunction) => {
         if (!this.bob || !this.alice) res.redirect("/index");
         else next();
      });
      this.app?.use(express.static(path.join(__dirname, "../public"), { index: false, extensions: ["html"] }));
   }

   /** Configure the socket.io server so that `handleNewConnection(...)` is called on new sockets and duplicate requests are filtered out. */
   private handleSocketConnection(): void {
      this.io?.on("connection", (socket) => {
         // Client always makes 2 connections when it connects, this just filters the second one out
         if (socket.id === this.bob?.socket.id || socket.id === this.alice?.socket.id) return;

         this.handleNewConnection(socket);
      });
   }

   //#endregion

   //#region Utilities

   private findUserByKey(key: string): User | undefined {
      if (this.bob?.key === key) return this.bob;
      if (this.alice?.key === key) return this.alice;
      return undefined;
   }

   //#endregion

   /**
    * Handles what happens, when a new user (Bob or Alice) connects to the server.
    *
    * -> If we get to here, than we know, there is space for a new user.
    */
   private handleNewConnection(socket: Socket): void {
      const match = this.findUserByKey(socket.handshake.query.key as string);

      if (match) {
         match.socket = socket;
         this.acceptUser(match);
      } else if (!this.bob) {
         this.bob = {
            name: "Bob",
            socket: socket,
            key: socket.id,
         };
         this.acceptUser(this.bob);
         console.log("Bob connected");
      } else if (!this.alice) {
         this.alice = {
            name: "Alice",
            socket: socket,
            key: socket.id,
         };
         this.acceptUser(this.alice);
         console.log("Alice connected");
      } else {
         socket.emit("reject-user");
         return;
      }
   }

   private acceptUser(user: User): void {
      user.socket.emit("accept-user", {
         name: user.name,
         socket: user.socket.id,
         ip: user.socket.conn.remoteAddress,
      });

      user.socket.on("disconnect", () => {
         console.log(`${user.name} disconnected`);

         if (user.name === "Bob") this.bob = undefined;
         if (user.name === "Alice") this.alice = undefined;

         user.socket.broadcast.emit("update-user-list", { users: this.getUsers() });
      });

      user.socket.on("call-user", (data) => {
         user.socket.to(data.to).emit("call-made", {
            offer: data.offer,
            socket: user.socket.id,
         });
      });

      user.socket.on("make-answer", (data) => {
         user.socket.to(data.to).emit("answer-made", {
            socket: user.socket.id,
            answer: data.answer,
         });
      });

      let users = this.getUsers();

      user.socket.emit("update-user-list", { users });
      user.socket.broadcast.emit("update-user-list", { users });
   }

   private getUsers() {
      let users: { socketId: string; name: string; ip: string }[] = [];
      if (this.bob) users.push({ socketId: this.bob.socket.id, name: "Bob", ip: this.bob.socket.conn.remoteAddress });
      if (this.alice) users.push({ socketId: this.alice.socket.id, name: "Alice", ip: this.alice.socket.conn.remoteAddress });

      return users;
   }
}
